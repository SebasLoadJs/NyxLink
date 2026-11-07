"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrationRestart = void 0;
exports.migratePlayer = migratePlayer;
const NodeSelector_1 = require("../nodes/NodeSelector");
const TrackCodec_1 = require("../tracks/TrackCodec");
const TrackResolver_1 = require("../tracks/TrackResolver");
const PlaybackAttempt_1 = require("./PlaybackAttempt");
const PlaybackGuard_1 = require("./PlaybackGuard");
exports.migrationRestart = Symbol('migrationRestart');
async function migratePlayer(player, target, ticket) {
    const source = player.node;
    const guard = (0, PlaybackGuard_1.playbackGuard)(player);
    const attempts = (0, PlaybackAttempt_1.playbackAttempt)(player);
    const active = () => !player.destroyed && guard.isCurrent(ticket) && NodeSelector_1.NodeSelector.matches(target, player.nodeSelection);
    const report = (status, reason) => {
        player.manager.emit('playerNodeFailover', player, {
            source: source.identifier, target: target.identifier, status, positionMs: player.current?.position, reason,
        });
    };
    const cleanup = async (node) => {
        try {
            await node.rest.destroyPlayer(player.guildId, { timeoutMs: 10000 });
        }
        catch (error) {
            player.manager.emit('nodeError', node, error);
            return error.message;
        }
    };
    let rollback;
    let committed = false;
    try {
        if (!active() || source === target)
            return false;
        report('in-progress');
        if (!active()) {
            report('cancelled');
            return false;
        }
        const original = player.current;
        const resolved = original ? await TrackResolver_1.TrackResolver.resolve(original, target, source) : null;
        if (!active() || player.current !== original) {
            report('cancelled');
            return false;
        }
        const snapshot = {
            position: original?.position, playing: player.playing, paused: player.paused,
            lastState: player.get('lastState'), lastKnownPosition: player.get('lastKnownPosition'),
        };
        const restoreAttempt = attempts.checkpoint();
        const tagged = new Map();
        const persist = async (bestEffort = false) => {
            const values = [
                ['current', player.current ? TrackCodec_1.TrackCodec.serialize(player.current) : null],
                ['queue', player.queue.tracks.map(track => TrackCodec_1.TrackCodec.serialize(track))],
                ['previous', player.previous.map(track => TrackCodec_1.TrackCodec.serialize(track))],
                ['playing', player.playing], ['paused', player.paused], ['node', player.node.identifier],
            ];
            for (const [path, value] of values) {
                try {
                    await player.updateData(path, value);
                }
                catch (error) {
                    if (!bestEffort)
                        throw error;
                    player.manager.emit('debug', `NyxLink > Migration rollback storage failed for ${path}: ${error.message}`);
                }
            }
        };
        rollback = async () => {
            player.node = source;
            player.current = original;
            if (original)
                original.position = snapshot.position;
            player.playing = !player.destroyed && snapshot.playing;
            player.paused = snapshot.paused;
            player.set('lastState', snapshot.lastState);
            player.set('lastKnownPosition', snapshot.lastKnownPosition);
            for (const [track, backend] of tagged)
                track.backend = backend;
            restoreAttempt(ticket);
            await persist(true);
            await cleanup(target);
        };
        player.node = target;
        player.current = resolved;
        if (resolved)
            resolved.position = snapshot.position;
        player.set('lastState', undefined);
        if (!await player.restart({ destroyOnFailure: false, startQueued: false, [exports.migrationRestart]: true }) || !active()) {
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
    }
    catch (error) {
        if (committed)
            throw error;
        if (rollback)
            await rollback();
        report(guard.isCurrent(ticket) ? 'failed' : 'cancelled', error.message);
        return false;
    }
    finally {
        attempts.retain(ticket);
    }
}
//# sourceMappingURL=PlayerMigration.js.map