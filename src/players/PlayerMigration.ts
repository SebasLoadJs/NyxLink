import { captureMixRecovery, restoreMixRecovery, type MixRecoveryReport } from './MixRecovery';
import type { FailoverReasonCode } from '../typings/Interfaces';
import type { Player } from '../entities/Player';
import type { Node } from '../entities/Node';
import type { Track } from '../entities/Track';
import { NodeSelector } from '../nodes/NodeSelector';
import { TrackCodec } from '../tracks/TrackCodec';
import { TrackResolver } from '../tracks/TrackResolver';
import { playbackAttempt } from './PlaybackAttempt';
import { playbackGuard } from './PlaybackGuard';
import { getManagerLogRoute } from '../logging/ManagerLogRoute';

export type MigrationStage = 'select-target' | 'resolve-track' | 'restore-player' | 'persist-snapshot' | 'cleanup-source' | 'rollback' | 'cleanup-target';
export interface MigrationStageObservation {
    migrationId: string;
    guildId: string;
    source: string;
    target: string;
    stage: MigrationStage;
    status: 'started' | 'acknowledged' | 'failed' | 'cancelled' | 'partial';
    elapsedMs: number;
}

/** Internal restart path: the caller already owns the player's command queue. */
export const migrationRestart: unique symbol = Symbol('migrationRestart');
export type RestartOptions = { destroyOnFailure?: boolean; startQueued?: boolean; /** @internal */ suspendedFeatures?: string[]; [migrationRestart]?: boolean };

/** Runs entirely within one player command, including rollback and cleanup. */
export async function migratePlayer(player: Player, target: Node, ticket: number): Promise<boolean> {
    const source = player.node;
    const suspendedFeatures: string[] = [];
    let manualPreloadDiscarded = false;
    let mixRecovery: MixRecoveryReport | undefined;
    let currentStage: MigrationStage = 'select-target';
    const observe = (stage: MigrationStage, status: MigrationStageObservation['status']) => {
        currentStage = stage;
        try { getManagerLogRoute(player.manager)?.recordMigrationStage(player, stage, status); } catch { /* diagnostics never control migration */ }
    };
    const guard = playbackGuard(player);
    const attempts = playbackAttempt(player);
    // Directly constructed nodes and players are supported by the public API.
    // If an object is registered, however, it must keep that exact registry identity.
    const registeredTarget = player.manager.nodes.nodes.get(target.identifier);
    const registeredPlayer = player.manager.players.get(player.guildId);
    const identity = (node: Node) => ({ session: node.sessionId, socket: node.socket, backend: node.backend, registered: player.manager.nodes.nodes.get(node.identifier) });
    const sourceIdentity = identity(source), targetIdentity = identity(target);
    const matchesIdentity = (node: Node, expected: ReturnType<typeof identity>): boolean =>
        node.sessionId === expected.session && node.socket === expected.socket &&
        node.backend === expected.backend && player.manager.nodes.nodes.get(node.identifier) === expected.registered;
    const active = () => !player.destroyed && !player.manager.destroyed && target.manager === player.manager &&
        (!registeredTarget || registeredTarget === target) && (!registeredPlayer || registeredPlayer === player) &&
        player.manager.nodes.nodes.get(target.identifier) === registeredTarget &&
        player.manager.players.get(player.guildId) === registeredPlayer &&
        guard.isCurrent(ticket) && matchesIdentity(target, targetIdentity) && NodeSelector.matches(target, player.nodeSelection);
    const report = (status: 'in-progress' | 'recovered' | 'failed' | 'cancelled', reason?: string, reasonCode?: FailoverReasonCode) => {
        player.manager.emit('playerNodeFailover', player, {
            source: source.identifier, target: target.identifier, status, positionMs: player.current?.position, reason, ...(reasonCode ? { reasonCode } : {}),
            ...(status === 'recovered' && suspendedFeatures.length ? { suspendedFeatures: [...new Set(suspendedFeatures)] } : {}),
            ...(status === 'recovered' && manualPreloadDiscarded ? { manualPreloadDiscarded: true } : {}),
            ...(status === 'recovered' && mixRecovery ? { mixRecovery } : {}),
        });
    };
    const cleanup = async (node: Node): Promise<string | undefined> => {
        try {
            // Never delete a player belonging to a replacement backend/session.
            if (!matchesIdentity(node, node === source ? sourceIdentity : targetIdentity)) {
                throw new Error('Migration cleanup skipped: backend identity changed');
            }
            await node.rest.destroyPlayer(player.guildId, { timeoutMs: 10000 });
        }
        catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            // A user-supplied event listener must not abort rollback or re-enter
            // cleanup after the backend has already rejected the request.
            try { player.manager.emit('nodeError', node, failure); } catch { /* observer failure */ }
            return failure.message;
        }
    };
    let rollback: (() => Promise<void>) | undefined;
    const runRollback = async (): Promise<void> => {
        const action = rollback;
        rollback = undefined;
        if (action) await action();
    };
    let committed = false;
    try {
        if (!active() || source === target) return false;
        report('in-progress');
        observe('select-target', 'acknowledged');
        if (!active()) { report('cancelled', undefined, 'intent-cancelled'); return false; }
        const mixOptions = player.manager.options.node?.mixRecovery;
        const mixes = mixOptions && source.isNodeLink ? await captureMixRecovery(player, source, mixOptions, active, guard.signal) : undefined;
        if (!active()) { report('cancelled', undefined, 'intent-cancelled'); return false; }
        const original = player.current;
        observe('resolve-track', 'started');
        const resolved = original ? await TrackResolver.resolve(original, target, source, guard.signal) : null;
        if (!active() || player.current !== original) { observe('resolve-track', 'cancelled'); report('cancelled', undefined, 'intent-cancelled'); return false; }
        observe('resolve-track', 'acknowledged');
        const snapshot = {
            position: original?.getInfo().position, playing: player.playing, paused: player.paused,
            lastState: player.get('lastState'), lastKnownPosition: player.get('lastKnownPosition'),
        };
        const restoreAttempt = attempts.checkpoint();
        const tagged = new Map<Track, Track['backend']>();
        const persist = async (bestEffort = false) => {
            let confirmed = true;
            // Owner is the final write: a destination must be acknowledged before it owns a session.
            const values: [string, unknown][] = [
                ['current', player.current ? TrackCodec.serialize(player.current) : null],
                ['queue', player.queue.tracks.map(track => TrackCodec.serialize(track))],
                ['previous', player.previous.map(track => TrackCodec.serialize(track))],
                ['playing', player.playing], ['paused', player.paused], ['node', player.node.identifier],
            ];
            for (const [path, value] of values) {
                try { await player.updateData(path, value); }
                catch (error) {
                    if (!bestEffort) throw error;
                    confirmed = false;
                    player.manager.emit('debug', `NyxLink > Migration rollback storage failed for ${path}: ${(error as Error).message}`);
                }
            }
            return confirmed;
        };
        rollback = async () => {
            observe('rollback', 'started');
            player.node = source;
            player.current = original;
            if (original) original.position = snapshot.position!;
            player.playing = !player.destroyed && snapshot.playing;
            player.paused = snapshot.paused;
            player.set('lastState', snapshot.lastState);
            player.set('lastKnownPosition', snapshot.lastKnownPosition);
            for (const [track, backend] of tagged) track.backend = backend;
            restoreAttempt(ticket);
            // Storage observers can throw; target cleanup still must be attempted.
            let stored = false;
            try { stored = await persist(true); }
            finally {
                observe('cleanup-target', 'started');
                const failure = await cleanup(target);
                observe('cleanup-target', failure ? 'failed' : 'acknowledged');
                observe('rollback', stored && !failure ? 'acknowledged' : 'partial');
            }
        };
        player.node = target;
        player.current = resolved;
        if (resolved) resolved.position = snapshot.position!;
        // Source acknowledgements cannot prove that the destination is synchronized.
        player.set('lastState', undefined);
        observe('restore-player', 'started');
        if (!await player.restart({ destroyOnFailure: false, startQueued: false, suspendedFeatures, [migrationRestart]: true }) || !active()) {
            observe('restore-player', active() ? 'failed' : 'cancelled');
            await runRollback();
            report(guard.isCurrent(ticket) ? 'failed' : 'cancelled', undefined, guard.isCurrent(ticket) ? 'restart-rejected' : 'intent-cancelled');
            return false;
        }
        observe('restore-player', 'acknowledged');
        for (const track of [...player.queue.tracks, ...player.previous]) {
            if (track.backend === undefined && source.backend?.kind !== undefined) {
                tagged.set(track, track.backend);
                track.backend = source.backend.kind;
            }
        }
        observe('persist-snapshot', 'started');
        await persist();
        if (!active()) {
            await runRollback();
            report('cancelled', undefined, 'intent-cancelled');
            return false;
        }
        observe('persist-snapshot', 'acknowledged');
        committed = true;
        rollback = undefined;
        // Never replay a source-node reservation. Queue-backed preparation is
        // recalculated on the new node; a manual reservation must be requested again.
        try { manualPreloadDiscarded = player.completeAudioMigration?.() ?? false; } catch { /* optional preparation cannot roll back committed ownership */ }
        observe('cleanup-source', 'started');
        const reason = await cleanup(source);
        observe('cleanup-source', reason ? 'failed' : 'acknowledged');
        if (mixes) {
            mixRecovery = mixes.report;
            if (!reason && active()) {
                try { mixRecovery = await restoreMixRecovery(player, source, target, mixes, active, guard.signal); }
                catch { /* layer recovery is optional; never roll back committed main playback */ }
            }
        }
        // The destination is already committed. Observer exceptions must not
        // turn a successful transfer into a rejected operation or a retry.
        const notify = (callback: () => void): void => {
            try { callback(); } catch { /* consumer listener failure */ }
        };
        notify(() => player.manager.emit('playerSwitchedNode', player, source, target));
        notify(() => report('recovered', reason, reason === undefined ? undefined : 'source-cleanup-failed'));
        if (original && active() && player.node === target) {
            notify(() => player.manager.emit('playerResumed', player));
        }
        return true;
    } catch (error) {
        observe(currentStage, guard.isCurrent(ticket) ? 'failed' : 'cancelled');
        if (committed) throw error;
        if (rollback) await runRollback();
        report(guard.isCurrent(ticket) ? 'failed' : 'cancelled', (error as Error).message, guard.isCurrent(ticket) ? 'migration-error' : 'intent-cancelled');
        return false;
    } finally {
        attempts.retain(ticket);
    }
}
