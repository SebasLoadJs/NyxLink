import { validateSourceHealthEvent, type SourceHealthEntry, type SourceHealthEvent } from '../backends/NodeLinkContracts';

export type SourceHealthObservation = { source: string; health: SourceHealthEntry; receivedAt: number; timestamp?: number };

/** Connection-local telemetry. Never persists server claims across reconnects. */
export class SourceHealthMonitor {
    private readonly entries = new Map<string, SourceHealthObservation>();
    private lastSnapshot?: number;
    private hasSnapshot = false;
    public clear(): void { this.entries.clear(); this.lastSnapshot = undefined; this.hasSnapshot = false; }

    public apply(input: unknown, now = Date.now()): SourceHealthEvent | undefined {
        validateSourceHealthEvent(input);
        const event = structuredClone(input);
        if (event.type === 'SourceHealthSnapshotEvent') {
            if (this.hasSnapshot && (event.timestamp === undefined || this.lastSnapshot !== undefined && event.timestamp < this.lastSnapshot)) return;
            // Timestamp-less legacy snapshots cannot overwrite a received change.
            const preserve = (entry: SourceHealthObservation) => event.timestamp === undefined ||
                entry.timestamp !== undefined && entry.timestamp > event.timestamp;
            for (const [source, entry] of this.entries) if (!preserve(entry)) this.entries.delete(source);
            for (const [source, health] of Object.entries(event.sources)) {
                const previous = this.entries.get(source);
                if (previous && preserve(previous)) continue;
                this.entries.set(source, { source, health, receivedAt: now, timestamp: event.timestamp });
            }
            this.hasSnapshot = true;
            this.lastSnapshot = event.timestamp;
        } else {
            const previous = this.entries.get(event.source);
            if (this.lastSnapshot !== undefined && event.timestamp < this.lastSnapshot ||
                previous?.timestamp !== undefined && event.timestamp < previous.timestamp) return;
            const { op, type, source, previousStatus, timestamp, ...health } = event;
            // Do not retain stale metrics that the change event does not explicitly provide.
            this.entries.set(source, { source, health, receivedAt: now, timestamp });
        }
        return structuredClone(event);
    }

    public get(source: string): SourceHealthObservation | undefined {
        const result = this.entries.get(source);
        return result ? structuredClone(result) : undefined;
    }

    public list(): SourceHealthObservation[] { return structuredClone([...this.entries.values()]); }
}
