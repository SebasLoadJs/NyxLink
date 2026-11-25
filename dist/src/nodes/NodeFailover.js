"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeFailover = void 0;
const PlaybackGuard_1 = require("../players/PlaybackGuard");
const Util_1 = require("../Util");
const RecoveryQueue_1 = require("./RecoveryQueue");
const RetryDelay_1 = require("./RetryDelay");
const pending = new WeakMap();
const queues = new WeakMap();
class NodeFailover {
    static move(player, source, options = player.manager.options.node?.failover ?? {}) {
        const existing = pending.get(player);
        if (existing)
            return existing;
        const guard = (0, PlaybackGuard_1.playbackGuard)(player);
        const ticket = guard.ticket;
        const cancelled = () => player.destroyed || source.destroyed || player.manager.destroyed ||
            player.node !== source || !guard.isCurrent(ticket);
        const operation = Promise.resolve().then(() => {
            if (cancelled())
                return { status: 'cancelled', attempts: 0 };
            let queue = queues.get(player.manager);
            if (!queue) {
                const settings = player.manager.options.node;
                queue = new RecoveryQueue_1.RecoveryQueue(settings?.recoveryConcurrency, settings?.recoveryQueueLimit);
                queues.set(player.manager, queue);
            }
            return queue.run(() => {
                if (cancelled())
                    return Promise.resolve({ status: 'cancelled', attempts: 0 });
                return this.attempt(player, source, options);
            }, () => {
                player.manager.emit('playerRecoveryFailed', player);
                return { status: 'failed', attempts: 0, reason: 'queue-full' };
            });
        }).finally(() => pending.delete(player));
        pending.set(player, operation);
        return operation;
    }
    static async attempt(player, source, options) {
        const maxAttempts = options.maxAttempts ?? 3;
        const baseDelay = options.retryDelayMs ?? 0;
        const jitter = (0, RetryDelay_1.retryJitter)(options.retryJitter !== undefined ? options.retryJitter : player.manager.options.node?.retryJitter);
        if (!Number.isInteger(maxAttempts) || maxAttempts < 0 || maxAttempts > 10 || !Number.isFinite(baseDelay) || baseDelay < 0 || baseDelay > 60000) {
            throw new TypeError('Failover requires maxAttempts 0..10 and retryDelayMs 0..60000');
        }
        const excluded = new Set([source.identifier]);
        for (const node of player.manager.nodes.nodes.values()) {
            if (Boolean(node.backend) !== Boolean(source.backend))
                excluded.add(node.identifier);
        }
        const guard = (0, PlaybackGuard_1.playbackGuard)(player);
        let ticket = guard.ticket;
        let attempts = 0;
        while (attempts < maxAttempts) {
            if (player.destroyed || source.destroyed || player.manager.destroyed || !guard.isCurrent(ticket))
                return { status: 'cancelled', attempts };
            const target = player.manager.nodes.findNode({ ...player.nodeSelection, exclude: [...excluded], allowUnhealthyFallback: false });
            if (!target)
                break;
            excluded.add(target.identifier);
            attempts++;
            const transferTicket = ticket + 1;
            const transferring = player.transferNode(target);
            if (guard.ticket > ticket)
                ticket = transferTicket;
            let restored = false;
            try {
                restored = await transferring;
            }
            catch { }
            if (player.destroyed || source.destroyed || player.manager.destroyed || !guard.isCurrent(ticket))
                return { status: 'cancelled', attempts };
            if (restored && player.node === target && target.connected && !target.destroyed) {
                return { status: 'recovered', attempts, node: target };
            }
            if (baseDelay && attempts < maxAttempts)
                await (0, Util_1.delay)((0, RetryDelay_1.retryDelay)(baseDelay, 0, jitter, 60000));
        }
        player.manager.emit('playerRecoveryFailed', player);
        return { status: 'failed', attempts };
    }
}
exports.NodeFailover = NodeFailover;
//# sourceMappingURL=NodeFailover.js.map