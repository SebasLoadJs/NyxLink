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
    const active = () => !player.destroyed && guard.isCurrent(ticket) && NodeSelector.matches(target, player.nodeSelection);
    const report = (status: 'in-progress' | 'recovered' | 'failed' | 'cancelled', reason?: string) => {
        player.manager.emit('playerNodeFailover', player, {
            source: source.identifier, target: target.identifier, status, positionMs: player.current?.position, reason,
        });
    };
    const cleanup = async (node: Node): Promise<string | undefined> => {
        try { await node.rest.destroyPlayer(player.guildId, { timeoutMs: 10000 }); }
        catch (error) {
            player.manager.emit('nodeError', node, error as Error);
            return (error as Error).message;
        }
    };
    let rollback: (() => Promise<void>) | undefined;
    let committed = false;
    try {
        if (!active() || source === target) return false;
        report('in-progress');
        if (!active()) { report('cancelled'); return false; }
        const original = player.current;
        const resolved = original ? await TrackResolver.resolve(original, target, source) : null;
        if (!active() || player.current !== original) { report('cancelled'); return false; }
        const snapshot = {
            position: original?.position, playing: player.playing, paused: player.paused,
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
            await persist(true);
            await cleanup(target);
        };
        player.node = target;
        player.current = resolved;
        if (resolved) resolved.position = snapshot.position!;
        // Source acknowledgements cannot prove that the destination is synchronized.
        player.set('lastState', undefined);
        if (!await player.restart({ destroyOnFailure: false, startQueued: false, [migrationRestart]: true }) || !active()) {
            await rollback();
            rollback = undefined;
            report(guard.isCurrent(ticket) ? 'failed' : 'cancelled');
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
            await rollback();
            rollback = undefined;
            report('cancelled');
            return false;
        }
        committed = true;
        rollback = undefined;
        const reason = await cleanup(source);
        player.manager.emit('playerSwitchedNode', player, source, target);
        report('recovered', reason);
        return true;
    } catch (error) {
        if (committed) throw error;
        if (rollback) await rollback();
        report(guard.isCurrent(ticket) ? 'failed' : 'cancelled', (error as Error).message);
        return false;
    } finally {
        attempts.retain(ticket);
    }
}
