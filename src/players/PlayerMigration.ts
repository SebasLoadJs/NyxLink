import type { Player } from '../entities/Player';
import type { Node } from '../entities/Node';
import type { Track } from '../entities/Track';
import { NodeSelector } from '../nodes/NodeSelector';
import { TrackCodec } from '../tracks/TrackCodec';
import { TrackResolver } from '../tracks/TrackResolver';
import { playbackAttempt } from './PlaybackAttempt';
import { playbackGuard } from './PlaybackGuard';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

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
export type RestartOptions = { destroyOnFailure?: boolean; startQueued?: boolean; [migrationRestart]?: boolean };

/** Runs entirely within one player command, including rollback and cleanup. */
export async function migratePlayer(player: Player, target: Node, ticket: number): Promise<boolean> {
    const source = player.node;
    const logger = player.manager.logger;
    const migrationId = logger?.isEnabled('debug') ? randomUUID() : undefined;
    const started = performance.now();
    let currentStage: MigrationStage = 'select-target';
    const observe = (stage: MigrationStage, status: MigrationStageObservation['status']) => {
        currentStage = stage;
        if (!migrationId) return;
        const observation: MigrationStageObservation = { migrationId, guildId: player.guildId, source: source.identifier,
            target: target.identifier, stage, status, elapsedMs: performance.now() - started };
        try { logger?.event('debug', 'Failover', 'migration.' + stage, { ...observation }); } catch { /* diagnostics never control migration */ }
    };
    const guard = playbackGuard(player);
    const attempts = playbackAttempt(player);
    // Directly constructed nodes and players are supported by the public API.
    // If an object is registered, however, it must keep that exact registry identity.
    const registeredTarget = player.manager.nodes.nodes.get(target.identifier);
    const registeredPlayer = player.manager.players.get(player.guildId);
    const active = () => !player.destroyed && !player.manager.destroyed && target.manager === player.manager &&
        (!registeredTarget || registeredTarget === target) && (!registeredPlayer || registeredPlayer === player) &&
        player.manager.nodes.nodes.get(target.identifier) === registeredTarget &&
        player.manager.players.get(player.guildId) === registeredPlayer &&
        guard.isCurrent(ticket) && NodeSelector.matches(target, player.nodeSelection);
    const report = (status: 'in-progress' | 'recovered' | 'failed' | 'cancelled', reason?: string) => {
        player.manager.emit('playerNodeFailover', player, {
            source: source.identifier, target: target.identifier, status, positionMs: player.current?.position, reason,
        });
    };
    const cleanup = async (node: Node): Promise<string | undefined> => {
        try { await node.rest.destroyPlayer(player.guildId, { timeoutMs: 10000 }); }
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
        observe('select-target', 'acknowledged');
        report('in-progress');
        if (!active()) { report('cancelled'); return false; }
        const original = player.current;
        observe('resolve-track', 'started');
        const resolved = original ? await TrackResolver.resolve(original, target, source) : null;
        if (!active() || player.current !== original) { observe('resolve-track', 'cancelled'); report('cancelled'); return false; }
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
        if (!await player.restart({ destroyOnFailure: false, startQueued: false, [migrationRestart]: true }) || !active()) {
            observe('restore-player', active() ? 'failed' : 'cancelled');
            await runRollback();
            report(guard.isCurrent(ticket) ? 'failed' : 'cancelled');
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
            report('cancelled');
            return false;
        }
        observe('persist-snapshot', 'acknowledged');
        committed = true;
        rollback = undefined;
        observe('cleanup-source', 'started');
        const reason = await cleanup(source);
        observe('cleanup-source', reason ? 'failed' : 'acknowledged');
        // The destination is already committed. Observer exceptions must not
        // turn a successful transfer into a rejected operation or a retry.
        const notify = (callback: () => void): void => {
            try { callback(); } catch { /* consumer listener failure */ }
        };
        notify(() => player.manager.emit('playerSwitchedNode', player, source, target));
        notify(() => report('recovered', reason));
        if (original && !player.destroyed && guard.isCurrent(ticket) && player.node === target) {
            notify(() => player.manager.emit('playerResumed', player));
        }
        return true;
    } catch (error) {
        observe(currentStage, guard.isCurrent(ticket) ? 'failed' : 'cancelled');
        if (committed) throw error;
        if (rollback) await runRollback();
        report(guard.isCurrent(ticket) ? 'failed' : 'cancelled', (error as Error).message);
        return false;
    } finally {
        attempts.retain(ticket);
    }
}
