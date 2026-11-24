"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrationRestart = void 0;
exports.migratePlayer = migratePlayer;
const NodeSelector_1 = require("../nodes/NodeSelector");
const TrackCodec_1 = require("../tracks/TrackCodec");
const TrackResolver_1 = require("../tracks/TrackResolver");
const PlaybackAttempt_1 = require("./PlaybackAttempt");
const PlaybackGuard_1 = require("./PlaybackGuard");
const ManagerLogRoute_1 = require("../logging/ManagerLogRoute");
exports.migrationRestart = Symbol('migrationRestart');
async function migratePlayer(player, target, ticket) {
    const source = player.node;
    let currentStage = 'select-target';
    const observe = (stage, status) => {
        currentStage = stage;
        try {
            (0, ManagerLogRoute_1.getManagerLogRoute)(player.manager)?.recordMigrationStage(player, stage, status);
        }
        catch { }
    };
    const guard = (0, PlaybackGuard_1.playbackGuard)(player);
    const attempts = (0, PlaybackAttempt_1.playbackAttempt)(player);
    const registeredTarget = player.manager.nodes.nodes.get(target.identifier);
    const registeredPlayer = player.manager.players.get(player.guildId);
    const active = () => !player.destroyed && !player.manager.destroyed && target.manager === player.manager &&
        (!registeredTarget || registeredTarget === target) && (!registeredPlayer || registeredPlayer === player) &&
        player.manager.nodes.nodes.get(target.identifier) === registeredTarget &&
        player.manager.players.get(player.guildId) === registeredPlayer &&
        guard.isCurrent(ticket) && NodeSelector_1.NodeSelector.matches(target, player.nodeSelection);
    const report = (status, reason, reasonCode) => {
        player.manager.emit('playerNodeFailover', player, {
            source: source.identifier, target: target.identifier, status, positionMs: player.current?.position, reason, ...(reasonCode ? { reasonCode } : {}),
        });
    };
    const cleanup = async (node) => {
        try {
            await node.rest.destroyPlayer(player.guildId, { timeoutMs: 10000 });
        }
        catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            try {
                player.manager.emit('nodeError', node, failure);
            }
            catch { }
            return failure.message;
        }
    };
    let rollback;
    const runRollback = async () => {
        const action = rollback;
        rollback = undefined;
        if (action)
            await action();
    };
    let committed = false;
    try {
        if (!active() || source === target)
            return false;
        report('in-progress');
        observe('select-target', 'acknowledged');
        if (!active()) {
            report('cancelled', undefined, 'intent-cancelled');
            return false;
        }
        const original = player.current;
        observe('resolve-track', 'started');
        const resolved = original ? await TrackResolver_1.TrackResolver.resolve(original, target, source, guard.signal) : null;
        if (!active() || player.current !== original) {
            observe('resolve-track', 'cancelled');
            report('cancelled', undefined, 'intent-cancelled');
            return false;
        }
        observe('resolve-track', 'acknowledged');
        const snapshot = {
            position: original?.getInfo().position, playing: player.playing, paused: player.paused,
            lastState: player.get('lastState'), lastKnownPosition: player.get('lastKnownPosition'),
        };
        const restoreAttempt = attempts.checkpoint();
        const tagged = new Map();
        const persist = async (bestEffort = false) => {
            let confirmed = true;
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
                    confirmed = false;
                    player.manager.emit('debug', `NyxLink > Migration rollback storage failed for ${path}: ${error.message}`);
                }
            }
            return confirmed;
        };
        rollback = async () => {
            observe('rollback', 'started');
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
            let stored = false;
            try {
                stored = await persist(true);
            }
            finally {
                observe('cleanup-target', 'started');
                const failure = await cleanup(target);
                observe('cleanup-target', failure ? 'failed' : 'acknowledged');
                observe('rollback', stored && !failure ? 'acknowledged' : 'partial');
            }
        };
        player.node = target;
        player.current = resolved;
        if (resolved)
            resolved.position = snapshot.position;
        player.set('lastState', undefined);
        observe('restore-player', 'started');
        if (!await player.restart({ destroyOnFailure: false, startQueued: false, [exports.migrationRestart]: true }) || !active()) {
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
        observe('cleanup-source', 'started');
        const reason = await cleanup(source);
        observe('cleanup-source', reason ? 'failed' : 'acknowledged');
        const notify = (callback) => {
            try {
                callback();
            }
            catch { }
        };
        notify(() => player.manager.emit('playerSwitchedNode', player, source, target));
        notify(() => report('recovered', reason, reason === undefined ? undefined : 'source-cleanup-failed'));
        if (original && !player.destroyed && guard.isCurrent(ticket) && player.node === target) {
            notify(() => player.manager.emit('playerResumed', player));
        }
        return true;
    }
    catch (error) {
        observe(currentStage, guard.isCurrent(ticket) ? 'failed' : 'cancelled');
        if (committed)
            throw error;
        if (rollback)
            await runRollback();
        report(guard.isCurrent(ticket) ? 'failed' : 'cancelled', error.message, guard.isCurrent(ticket) ? 'migration-error' : 'intent-cancelled');
        return false;
    }
    finally {
        attempts.retain(ticket);
    }
}
//# sourceMappingURL=PlayerMigration.js.map