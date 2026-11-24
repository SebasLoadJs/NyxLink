import { performance } from 'node:perf_hooks';
import type { Manager } from '../core/Manager';
import type { SearchResult } from '../structures/SearchResult';

type Attributes = Record<string, string>;
export interface TelemetryMeter {
    createCounter(name: string): { add(value: number, attributes?: Attributes): void };
    createHistogram(name: string, options?: { unit?: string }): { record(value: number, attributes?: Attributes): void };
}
export interface TelemetryTracer {
    startSpan(name: string): {
        setStatus(status: { code: 0 | 1 | 2 }): unknown;
        setAttribute(key: string, value: string): unknown;
        end(): void;
    };
}
export interface OpenTelemetryOptions {
    meter?: TelemetryMeter;
    tracer?: TelemetryTracer;
}

/** Optional instrumentation using the host's OpenTelemetry API objects.
 * No SDK, global provider, network exporter or timer is installed here.
 */
export class OpenTelemetry {
    private readonly counter?: ReturnType<TelemetryMeter['createCounter']>;
    private readonly duration?: ReturnType<TelemetryMeter['createHistogram']>;
    private readonly disposers: Array<() => void> = [];
    private closed = false;

    constructor(manager: Manager, private readonly options: OpenTelemetryOptions) {
        this.counter = this.safe(() => options.meter?.createCounter('nyxlink.events'));
        this.duration = this.safe(() => options.meter?.createHistogram('nyxlink.search.duration', { unit: 'ms' }));
        // Fixed vocabulary only. Never export node identifiers, guild IDs, tracks,
        // query strings, provider error messages, or raw event payloads.
        this.disposers.push(
            manager.on('nodeReady', node => this.event('node.ready', this.backend(node.backend?.kind))),
            manager.on('nodeError', node => this.event('node.error', this.backend(node.backend?.kind))),
            manager.on('nodeDisconnect', node => this.event('node.disconnect', this.backend(node.backend?.kind))),
            manager.on('trackStart', player => this.event('track.start', this.backend(player.node.backend?.kind))),
            manager.on('trackException', player => this.event('track.error', this.backend(player.node.backend?.kind))),
            manager.on('queueEnd', player => this.event('queue.end', this.backend(player.node.backend?.kind))),
            manager.on('playerNodeFailover', (player, report) => {
                const status = report.status;
                if (status === 'in-progress' || status === 'recovered' || status === 'failed' || status === 'cancelled') {
                    this.event('failover.' + status, this.backend(player.node.backend?.kind));
                }
            }),
        );
    }

    private safe<T>(action: () => T): T | undefined {
        try { return action(); } catch { return undefined; }
    }

    private backend(value: unknown): string {
        return value === 'lavalink' || value === 'nodelink' ? value : 'unknown';
    }

    private event(name: string, backend: string): void {
        if (!this.closed) this.safe(() => this.counter?.add(1, { event: name, backend }));
    }

    async search(operation: () => Promise<SearchResult>): Promise<SearchResult> {
        if (this.closed) return operation();
        const start = performance.now();
        const span = this.safe(() => this.options.tracer?.startSpan('nyxlink.search'));
        let outcome = 'error';
        try {
            const result = await operation();
            outcome = result.isError ? 'error' : result.tracks.length ? 'success' : 'empty';
            return result;
        } finally {
            // A thrown backend error propagates unchanged; never record its message.
            this.safe(() => span?.setAttribute('nyxlink.outcome', outcome));
            this.safe(() => span?.setStatus({ code: outcome === 'error' ? 2 : 0 }));
            this.safe(() => span?.end());
            if (!this.closed) {
                this.safe(() => this.duration?.record(performance.now() - start, { outcome }));
                this.event('search.' + outcome, 'unknown');
            }
        }
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        for (const dispose of this.disposers.splice(0)) this.safe(dispose);
    }
}
