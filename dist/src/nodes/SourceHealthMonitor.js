"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceHealthMonitor = void 0;
const NodeLinkContracts_1 = require("../backends/NodeLinkContracts");
class SourceHealthMonitor {
    entries = new Map();
    lastSnapshot;
    hasSnapshot = false;
    clear() { this.entries.clear(); this.lastSnapshot = undefined; this.hasSnapshot = false; }
    apply(input, now = Date.now()) {
        (0, NodeLinkContracts_1.validateSourceHealthEvent)(input);
        const event = structuredClone(input);
        if (event.type === 'SourceHealthSnapshotEvent') {
            if (this.hasSnapshot && (event.timestamp === undefined || this.lastSnapshot !== undefined && event.timestamp < this.lastSnapshot))
                return;
            const preserve = (entry) => event.timestamp === undefined ||
                entry.timestamp !== undefined && entry.timestamp > event.timestamp;
            for (const [source, entry] of this.entries)
                if (!preserve(entry))
                    this.entries.delete(source);
            for (const [source, health] of Object.entries(event.sources)) {
                const previous = this.entries.get(source);
                if (previous && preserve(previous))
                    continue;
                this.entries.set(source, { source, health, receivedAt: now, timestamp: event.timestamp });
            }
            this.hasSnapshot = true;
            this.lastSnapshot = event.timestamp;
        }
        else {
            const previous = this.entries.get(event.source);
            if (this.lastSnapshot !== undefined && event.timestamp < this.lastSnapshot ||
                previous?.timestamp !== undefined && event.timestamp < previous.timestamp)
                return;
            const { op, type, source, previousStatus, timestamp, ...health } = event;
            this.entries.set(source, { source, health, receivedAt: now, timestamp });
        }
        return structuredClone(event);
    }
    get(source) {
        const result = this.entries.get(source);
        return result ? structuredClone(result) : undefined;
    }
    list() { return structuredClone([...this.entries.values()]); }
}
exports.SourceHealthMonitor = SourceHealthMonitor;
//# sourceMappingURL=SourceHealthMonitor.js.map