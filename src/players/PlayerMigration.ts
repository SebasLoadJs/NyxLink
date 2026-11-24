import type { FailoverReasonCode } from '../typings/Interfaces';
import type { Player } from '../entities/Player';
import type { Node } from '../entities/Node';
import type { Track } from '../entities/Track';
import { NodeSelector } from '../nodes/NodeSelector';
import { TrackCodec } from '../tracks/TrackCodec';
import { TrackResolver } from '../tracks/TrackResolver';
import { playbackAttempt } from './PlaybackAttempt';
import { playbackGuard } from './PlaybackGuard';

/** Internal restart path: the caller already owns the player's command queue. */
export const migrationRestart: unique symbol = Symbol('migrationRestart');
export type RestartOptions = { destroyOnFailure?: boolean; startQueued?: boolean; [migrationRestart]?: boolean };

/** Runs entirely within one player command, including rollback and cleanup. */
export async function migratePlayer(player: Player, target: Node, ticket: number): Promise<boolean> {
    const source = player.node;
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
    const report = (status: 'in-progress' | 'recovered' | 'failed' | 'cancelled', reason?: string, reasonCode?: FailoverReasonCode) => {
        player.manager.emit('playerNodeFailover', player, {
            source: source.identifier, target: target.identifier, status, positionMs: player.current?.position, reason, ...(reasonCode ? { reasonCode } : {}),
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
        report('in-progress');
        if (!active()) { report('cancelled', undefined, 'intent-cancelled'); return false; }
        const original = player.current;
        const resolved = original ? await TrackResolver.resolve(original, target, source) : null;
        if (!active() || player.current !== original) { report('cancelled', undefined, 'intent-cancelled'); return false; }
        const snapshot = {
            position: original?.getInfo().position, playing: player.playing, paused: player.paused,
            lastState: player.get('lastState'), lastKnownPosition: player.get('lastKnownPosition'),
        };
        const restoreAttempt = attempts.checkpoint();
        const tagged = new Map<Track, Track['backend']>();
        const persist = async (bestEffort = false) => {
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
                    player.manager.emit('debug', `NyxLink > Migration rollback storage failed for ${path}: ${(error as Error).message}`);
                }
            }
        };
        rollback = async () => {
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
            try { await persist(true); }
            finally { await cleanup(target); }
        };
        player.node = target;
        player.current = resolved;
        if (resolved) resolved.position = snapshot.position!;
        // Source acknowledgements cannot prove that the destination is synchronized.
        player.set('lastState', undefined);
        if (!await player.restart({ destroyOnFailure: false, startQueued: false, [migrationRestart]: true }) || !active()) {
            await runRollback();
            report(guard.isCurrent(ticket) ? 'failed' : 'cancelled', undefined, guard.isCurrent(ticket) ? 'restart-rejected' : 'intent-cancelled');
            return false;
        }
        for (const track of [...player.queue.tracks, ...player.previous]) {
            if (track.backend === undefined && source.backend?.kind !== undefined) {
                tagged.set(track, track.backend);
                track.backend = source.backend.kind;
            }
        }
        await persist();
        if (!active()) {
            await runRollback();
            report('cancelled', undefined, 'intent-cancelled');
            return false;
        }
        committed = true;
        rollback = undefined;
        const reason = await cleanup(source);
        // The destination is already committed. Observer exceptions must not
        // turn a successful transfer into a rejected operation or a retry.
        const notify = (callback: () => void): void => {
            try { callback(); } catch { /* consumer listener failure */ }
        };
        notify(() => player.manager.emit('playerSwitchedNode', player, source, target));
        notify(() => report('recovered', reason, reason === undefined ? undefined : 'source-cleanup-failed'));
        if (original && !player.destroyed && guard.isCurrent(ticket) && player.node === target) {
            notify(() => player.manager.emit('playerResumed', player));
        }
        return true;
    } catch (error) {
        if (committed) throw error;
        if (rollback) await runRollback();
        report(guard.isCurrent(ticket) ? 'failed' : 'cancelled', (error as Error).message, guard.isCurrent(ticket) ? 'migration-error' : 'intent-cancelled');
        return false;
    } finally {
        attempts.retain(ticket);
    }
}
