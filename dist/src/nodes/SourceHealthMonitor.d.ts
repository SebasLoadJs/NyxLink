import { type SourceHealthEntry, type SourceHealthEvent } from '../backends/NodeLinkContracts';
export type SourceHealthObservation = {
    source: string;
    health: SourceHealthEntry;
    receivedAt: number;
    timestamp?: number;
};
export declare class SourceHealthMonitor {
    private readonly entries;
    private lastSnapshot?;
    private hasSnapshot;
    clear(): void;
    apply(input: unknown, now?: number): SourceHealthEvent | undefined;
    get(source: string): SourceHealthObservation | undefined;
    list(): SourceHealthObservation[];
}
