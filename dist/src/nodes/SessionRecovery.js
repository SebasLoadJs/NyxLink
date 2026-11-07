"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeSessionPlayers = resumeSessionPlayers;
const types_1 = require("../typings/types");
const PlaybackGuard_1 = require("../players/PlaybackGuard");
const PlaybackAttempt_1 = require("../players/PlaybackAttempt");
const pending = new WeakMap();
function current(context) {
    const { node } = context;
    return !node.destroyed && !node.manager.destroyed && node.connected && node.state === types_1.NodeState.READY &&
        node.sessionId === context.sessionId && node.socket === context.socket;
}
function snapshot(player) {
    return { player, ticket: (0, PlaybackGuard_1.playbackGuard)(player).ticket, track: player.current, position: player.current?.position,
        paused: player.paused, playing: player.playing, channel: player.voiceChannelId };
}
function unchanged(saved, node) {
    const { player } = saved;
    return !player.destroyed && player.node === node && node.manager.players.get(player.guildId) === player &&
        (0, PlaybackGuard_1.playbackGuard)(player).isCurrent(saved.ticket) && player.current === saved.track && player.current?.position === saved.position &&
        player.paused === saved.paused && player.playing === saved.playing && player.voiceChannelId === saved.channel;
}
function valid(row) {
    return row && typeof row.guildId === 'string' && /^\d{17,20}$/.test(row.guildId) && typeof row.paused === 'boolean' &&
        typeof row.volume === 'number' && Number.isFinite(row.volume) && row.volume >= 0 && row.volume <= 1000 &&
        typeof row.state?.position === 'number' && Number.isFinite(row.state.position) && row.state.position >= 0;
}
function apply(player, row) {
    player.playing = player.current !== null && row.paused === false;
    player.paused = row.paused;
    if (player.current)
        player.current.position = row.state.position;
}
function matchesTrack(player, node, row) {
    return player.current ? !!row.track && (0, PlaybackAttempt_1.playbackAttempt)(player).accepts(node, row.track) : !row.track?.encoded;
}
async function recover(context, known) {
    if (!current(context))
        return;
    const { node } = context;
    const manager = node.manager;
    const touched = new Set();
    let creating = false;
    const detachCreate = manager.on('playerCreate', player => { if (!creating)
        touched.add(player.guildId); });
    const detachDestroy = manager.on('playerDestroyed', player => touched.add(player.guildId));
    try {
        const rows = await node.rest.getPlayers();
        if (!current(context) || rows == null)
            return;
        if (!Array.isArray(rows))
            throw new TypeError('Invalid resumed player list');
        const seen = new Set();
        for (const row of rows) {
            if (!current(context))
                return;
            try {
                if (!valid(row))
                    throw new TypeError('Invalid resumed player state');
                if (seen.has(row.guildId))
                    continue;
                seen.add(row.guildId);
                if (touched.has(row.guildId))
                    continue;
                const saved = known.get(row.guildId);
                const existing = manager.players.get(row.guildId);
                if (saved) {
                    if (existing !== saved.player || !unchanged(saved, node) || !matchesTrack(existing, node, row))
                        continue;
                    existing.isResuming = true;
                    try {
                        apply(existing, row);
                        manager.emit('playerResumed', existing);
                    }
                    finally {
                        existing.isResuming = false;
                    }
                    continue;
                }
                if (existing)
                    continue;
                const storage = await manager.database.get(`players.${row.guildId}`);
                if (!current(context))
                    return;
                if (!storage || touched.has(row.guildId) || manager.players.has(row.guildId))
                    continue;
                if (storage.node !== undefined && storage.node !== node.identifier)
                    continue;
                let player;
                creating = true;
                try {
                    player = manager.players.restore({ ...storage, guildId: row.guildId, volume: row.volume, node: node.identifier });
                }
                finally {
                    creating = false;
                }
                if (player.destroyed || player.node !== node || manager.players.get(row.guildId) !== player || (0, PlaybackGuard_1.playbackGuard)(player).ticket !== 0 || touched.has(row.guildId))
                    continue;
                const initial = snapshot(player);
                player.isResuming = true;
                try {
                    manager.emit('playerResuming', player);
                    if (!current(context) || !unchanged(initial, node) || touched.has(row.guildId) || !matchesTrack(player, node, row))
                        continue;
                    await player.connect();
                    if (!current(context))
                        return;
                    if (!unchanged(initial, node) || touched.has(row.guildId) || !matchesTrack(player, node, row))
                        continue;
                    apply(player, row);
                    manager.emit('playerResumed', player);
                }
                finally {
                    player.isResuming = false;
                }
            }
            catch (error) {
                if (current(context))
                    manager.emit('nodeError', node, error instanceof Error ? error : new Error(String(error)));
            }
        }
    }
    finally {
        detachCreate();
        detachDestroy();
    }
}
function resumeSessionPlayers(node) {
    const context = { node, sessionId: node.sessionId, socket: node.socket };
    const previous = pending.get(node);
    if (previous && previous.sessionId === context.sessionId && previous.socket === context.socket)
        return previous.operation;
    const known = new Map(node.manager.players.all.map(player => [player.guildId, snapshot(player)]));
    const operation = Promise.resolve().then(() => recover(context, known)).catch(error => {
        if (current(context))
            node.manager.emit('nodeError', node, error instanceof Error ? error : new Error(String(error)));
    }).finally(() => { if (pending.get(node)?.operation === operation)
        pending.delete(node); });
    pending.set(node, { ...context, operation });
    return operation;
}
//# sourceMappingURL=SessionRecovery.js.map