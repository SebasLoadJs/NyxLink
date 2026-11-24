import type { Player } from '../entities/Player';
import type { Track } from '../entities/Track';
import type { QueuePreloadOptions } from '../backends/NodeLinkContracts';

/** Pure eligibility policy; player owns reservations and backend acknowledgments. */
export function desiredPreload(player: Player, options: QueuePreloadOptions | undefined, crossfadeEnabled: boolean): Track | undefined {
    const current = player.current;
    const next = player.queue.first;
    if (!player.node.isNodeLink || player.node.backend?.featureStatus('nextTrack') === 'unavailable' ||
        !options?.enabled || !crossfadeEnabled || player.loop !== 'off' || !player.playing ||
        !current || !next || next === current || next.encoded === current.encoded) return undefined;
    const info = current.getInfo();
    const remaining = info.length - info.position;
    if (info.isStream || !Number.isFinite(remaining) || remaining <= 0 || remaining > (options.leadMs ?? 35000)) return undefined;
    return next;
}

/** One pending job and at most one coalesced refresh; no timer or global player retention. */
export class QueuePreloadScheduler {
    public pending?: Promise<void>;
    private refresh = false;
    private retryAt = 0;

    public request(enqueue: (operation: () => Promise<void>) => Promise<void>, work: () => Promise<void>, failed: () => void, refresh: () => void): void {
        if (this.pending) { this.refresh = true; return; }
        const operation = enqueue(async () => {
            if (Date.now() >= this.retryAt) await work();
        }).catch(() => {
            this.retryAt = Date.now() + 10000;
            failed();
        }).finally(() => {
            if (this.pending !== operation) return;
            this.pending = undefined;
            if (this.refresh) { this.refresh = false; refresh(); }
        });
        this.pending = operation;
    }
}
