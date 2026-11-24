import type { Player } from '../entities/Player';
import type { Track } from '../entities/Track';
import type { QueuePreloadOptions } from '../backends/NodeLinkContracts';
export declare function desiredPreload(player: Player, options: QueuePreloadOptions | undefined, crossfadeEnabled: boolean): Track | undefined;
export declare class QueuePreloadScheduler {
    pending?: Promise<void>;
    private refresh;
    private retryAt;
    request(enqueue: (operation: () => Promise<void>) => Promise<void>, work: () => Promise<void>, failed: () => void, refresh: () => void): void;
}
