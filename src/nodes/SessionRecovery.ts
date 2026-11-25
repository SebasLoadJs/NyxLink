import { isDeepStrictEqual } from 'node:util';
import { observeOperation } from '../observability/OpenTelemetry';
import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';
import type { IPlayerConfig, IRESTGetPlayers } from '../typings/Interfaces';
import { NodeState } from '../typings/types';
import { playbackGuard } from '../players/PlaybackGuard';
import { playbackAttempt } from '../players/PlaybackAttempt';
import { recordRevision } from '../database/PlayerSnapshot';

type Context = { node: Node; sessionId: string; socket: Node['socket']; backend: Node['backend']; registered: Node | undefined };
type Snapshot = { player: Player; ticket: number; track: Player['current']; position?: number; paused: boolean; playing: boolean; channel: string };
const pending = new WeakMap<Node, Context & { operation: Promise<void> }>();

function current(context: Context): boolean {
    const { node } = context;
    return !node.destroyed && !node.manager.destroyed && node.connected && node.state === NodeState.READY &&
        node.sessionId === context.sessionId && node.socket === context.socket && node.backend === context.backend &&
        node.manager.nodes.nodes.get(node.identifier) === context.registered &&
        (context.registered === undefined || context.registered === node);
}

function snapshot(player: Player): Snapshot {
    return { player, ticket: playbackGuard(player).ticket, track: player.current, position: player.current?.position,
        paused: player.paused, playing: player.playing, channel: player.voiceChannelId };
}

function unchanged(saved: Snapshot, node: Node): boolean {
    const { player } = saved;
    return !player.destroyed && player.node === node && node.manager.players.get(player.guildId) === player &&
        playbackGuard(player).isCurrent(saved.ticket) && player.current === saved.track && player.current?.position === saved.position &&
        player.paused === saved.paused && player.playing === saved.playing && player.voiceChannelId === saved.channel;
}

function valid(row: IRESTGetPlayers): boolean {
    return row && typeof row.guildId === 'string' && /^\d{17,20}$/.test(row.guildId) && typeof row.paused === 'boolean' &&
        typeof row.volume === 'number' && Number.isFinite(row.volume) && row.volume >= 0 && row.volume <= 1000 &&
        typeof row.state?.position === 'number' && Number.isFinite(row.state.position) && row.state.position >= 0;
}

function apply(player: Player, row: IRESTGetPlayers): void {
    player.playing = player.current !== null && row.paused === false;
    player.paused = row.paused;
    if (player.current) player.current.position = row.state.position;
}

function matchesTrack(player: Player, node: Node, row: IRESTGetPlayers): boolean {
    return player.current ? !!row.track && playbackAttempt(player).accepts(node, row.track) : !row.track?.encoded;
}

async function recover(context: Context, known: Map<string, Snapshot>): Promise<void> {
    if (!current(context)) return;
    const { node } = context;
    const manager = node.manager;
    const touched = new Set<string>();
    let creating: string | undefined;
    const detachCreate = manager.on('playerCreate', player => { if (creating !== player.guildId) touched.add(player.guildId); });
    const detachDestroy = manager.on('playerDestroyed', player => touched.add(player.guildId));
    try {
        const rows = await node.rest.getPlayers();
        if (!current(context) || rows == null) return;
        if (!Array.isArray(rows)) throw new TypeError('Invalid resumed player list');
        // An ambiguous backend response must not arbitrarily select the first state.
        const firstRows = new Map<string, IRESTGetPlayers>();
        const conflicts = new Set<string>();
        const processed = new Set<string>();
        for (const row of rows) {
            if (!row || typeof row.guildId !== 'string') continue;
            const first = firstRows.get(row.guildId);
            if (first && !isDeepStrictEqual(first, row)) conflicts.add(row.guildId);
            else if (!first) firstRows.set(row.guildId, row);
        }
        for (const row of rows) {
            if (!current(context)) return;
            try {
                if (!valid(row)) throw new TypeError('Invalid resumed player state');
                if (conflicts.has(row.guildId) || processed.has(row.guildId)) continue;
                processed.add(row.guildId);
                if (touched.has(row.guildId)) continue;
                const saved = known.get(row.guildId);
                const existing = manager.players.get(row.guildId);
                if (saved) {
                    if (existing !== saved.player || !unchanged(saved, node) || !matchesTrack(existing, node, row)) continue;
                    existing.isResuming = true;
                    try { apply(existing, row); manager.emit('playerResumed', existing); }
                    finally { existing.isResuming = false; }
                    continue;
                }
                if (existing) continue;
                const storage = await manager.database.get<IPlayerConfig>(`players.${row.guildId}`);
                if (!current(context)) return;
                if (!storage || touched.has(row.guildId) || manager.players.has(row.guildId)) continue;
                if (storage.node !== undefined && storage.node !== node.identifier) continue;
                recordRevision(storage);
                // Do not publish or persist a reconstructed player until the stored track
                // has been matched to the actual resumed session.
                if (storage.current ? storage.current.encoded !== row.track?.encoded : !!row.track?.encoded) continue;
                let player: Player;
                creating = row.guildId;
                try {
                    const options = { ...storage, guildId: row.guildId, volume: row.volume, node: node.identifier };
                    player = manager.guildOwnership
                        ? await manager.players.restoreOwned(options)
                        : manager.players.restore(options);
                } finally { creating = undefined; }
                if (!current(context)) return;
                // A playerCreate callback may already have stopped, replaced or destroyed this player.
                if (player.destroyed || player.node !== node || manager.players.get(row.guildId) !== player || playbackGuard(player).ticket !== 0 || touched.has(row.guildId)) continue;
                const initial = snapshot(player);
                player.isResuming = true;
                try {
                    manager.emit('playerResuming', player);
                    if (!current(context) || !unchanged(initial, node) || touched.has(row.guildId) || !matchesTrack(player, node, row)) continue;
                    await player.connect();
                    if (!current(context)) return;
                    if (!unchanged(initial, node) || touched.has(row.guildId) || !matchesTrack(player, node, row)) continue;
                    apply(player, row);
                    manager.emit('playerResumed', player);
                } finally { player.isResuming = false; }
            } catch (error) {
                if (current(context)) manager.emit('nodeError', node, error instanceof Error ? error : new Error(String(error)));
            }
        }
    } finally { detachCreate(); detachDestroy(); }
}

/** Coalesces one session/socket; a later connection never inherits an older operation's result. */
export function resumeSessionPlayers(node: Node): Promise<void> {
    const context: Context = { node, sessionId: node.sessionId, socket: node.socket, backend: node.backend,
        registered: node.manager.nodes.nodes.get(node.identifier) };
    const previous = pending.get(node);
    if (previous && previous.sessionId === context.sessionId && previous.socket === context.socket &&
        previous.backend === context.backend && previous.registered === context.registered) return previous.operation;
    const known = new Map(node.manager.players.all.map(player => [player.guildId, snapshot(player)]));
    const operation: Promise<void> = Promise.resolve().then(() => observeOperation(node.manager, 'nyxlink.session.restore', () => recover(context, known))).catch(error => {
        if (current(context)) node.manager.emit('nodeError', node, error instanceof Error ? error : new Error(String(error)));
    }).finally(() => { if (pending.get(node)?.operation === operation) pending.delete(node); });
    pending.set(node, { ...context, operation });
    return operation;
}
