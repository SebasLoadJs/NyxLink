"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueuePreloadScheduler = void 0;
exports.desiredPreload = desiredPreload;
function desiredPreload(player, options, crossfadeEnabled) {
    const current = player.current;
    const next = player.queue.first;
    if (!player.node.isNodeLink || player.node.backend?.featureStatus('nextTrack') === 'unavailable' ||
        !options?.enabled || !crossfadeEnabled || player.loop !== 'off' || !player.playing ||
        !current || !next || next === current || next.encoded === current.encoded)
        return undefined;
    const info = current.getInfo();
    const remaining = info.length - info.position;
    if (info.isStream || !Number.isFinite(remaining) || remaining <= 0 || remaining > (options.leadMs ?? 35000))
        return undefined;
    return next;
}
class QueuePreloadScheduler {
    pending;
    refresh = false;
    retryAt = 0;
    request(enqueue, work, failed, refresh) {
        if (this.pending) {
            this.refresh = true;
            return;
        }
        const operation = enqueue(async () => {
            if (Date.now() >= this.retryAt)
                await work();
        }).catch(() => {
            this.retryAt = Date.now() + 10000;
            failed();
        }).finally(() => {
            if (this.pending !== operation)
                return;
            this.pending = undefined;
            if (this.refresh) {
                this.refresh = false;
                refresh();
            }
        });
        this.pending = operation;
    }
}
exports.QueuePreloadScheduler = QueuePreloadScheduler;
//# sourceMappingURL=QueuePreload.js.map