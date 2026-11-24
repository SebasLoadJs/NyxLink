import { performance } from 'node:perf_hooks';
import type { Manager } from '../core/Manager';
import type { SearchResult } from '../structures/SearchResult';

export type TelemetryOperation = 'nyxlink.rest' | 'nyxlink.player.play' | 'nyxlink.player.seek' | 'nyxlink.player.stop' | 'nyxlink.failover';
export type TelemetryOutcome = 'success' | 'empty' | 'error' | 'cancelled' | 'resolved';
const installed = new WeakMap<Manager, OpenTelemetry>();
export function observeOperation<T>(manager: Manager, name: TelemetryOperation, operation: () => Promise<T>, classify?: (result: T) => TelemetryOutcome): Promise<T> {
    const telemetry = installed.get(manager);
    return telemetry ? telemetry.operation(name, operation, classify) : operation();
}

type Attributes = Record<string, string>;
export interface TelemetryMeter {
    createCounter(name: string): { add(value: number, attributes?: Attributes): void };
    createHistogram(name: string, options?: { unit?: string }): { record(value: number, attributes?: Attributes): void };
}
export interface TelemetrySpan {
        setStatus(status: { code: 0 | 1 | 2 }): unknown;
        setAttribute(key: string, value: string): unknown;
        end(): void;
}
export interface TelemetryTracer {
    startSpan(name: string): TelemetrySpan;
    startActiveSpan?<T>(name: string, callback: (span: TelemetrySpan) => T): T;
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
    private readonly operationsDuration?: ReturnType<TelemetryMeter['createHistogram']>;
    private readonly disposers: Array<() => void> = [];
    private closed = false;

    constructor(manager: Manager, private readonly options: OpenTelemetryOptions) {
        this.counter = this.safe(() => options.meter?.createCounter('nyxlink.events'));
        this.duration = this.safe(() => options.meter?.createHistogram('nyxlink.search.duration', { unit: 'ms' }));
        this.operationsDuration = this.safe(() => options.meter?.createHistogram('nyxlink.operation.duration', { unit: 'ms' }));
        installed.set(manager, this);
        this.disposers.push(() => { if (installed.get(manager) === this) installed.delete(manager); });
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

    private run<T>(name: TelemetryOperation | 'nyxlink.search', operation: () => Promise<T>,
        classify: (result: T) => TelemetryOutcome): Promise<T> {
        if (this.closed) return operation();
        const start = performance.now();
        let invoked: Promise<T> | undefined;
        const execute = (span?: TelemetrySpan): Promise<T> => {
            if (invoked) return invoked;
            invoked = (async () => {
                let outcome: TelemetryOutcome = 'error';
                try {
                    const result = await operation();
                    outcome = this.safe(() => classify(result)) ?? 'resolved';
                    return result;
                } catch (error) {
                    if (error instanceof Error && error.name === 'AbortError') outcome = 'cancelled';
                    throw error;
                } finally {
                    this.safe(() => span?.setAttribute('nyxlink.outcome', outcome));
                    this.safe(() => span?.setStatus({ code: outcome === 'error' ? 2 : 0 }));
                    this.safe(() => span?.end());
                    if (!this.closed) {
                        const elapsed = performance.now() - start;
                        if (name === 'nyxlink.search') {
                            this.safe(() => this.duration?.record(elapsed, { outcome }));
                            this.event('search.' + outcome, 'unknown');
                        } else {
                            this.safe(() => this.operationsDuration?.record(elapsed, { operation: name, outcome }));
                            this.event('operation.' + name.slice(8) + '.' + outcome, 'unknown');
                        }
                    }
                }
            })();
            return invoked;
        };
        // The real OTel tracer activates context synchronously around this callback.
        // Never retry domain work when instrumentation throws after invoking it.
        if (this.options.tracer?.startActiveSpan) {
            try { this.options.tracer.startActiveSpan(name, execute); } catch {}
            if (invoked) return invoked;
        }
        return execute(this.safe(() => this.options.tracer?.startSpan(name)));
    }

    search(operation: () => Promise<SearchResult>): Promise<SearchResult> {
        return this.run('nyxlink.search', operation, result => result.isError ? 'error' : result.tracks.length ? 'success' : 'empty');
    }

    operation<T>(name: TelemetryOperation, operation: () => Promise<T>,
        classify: (result: T) => TelemetryOutcome = () => 'resolved'): Promise<T> {
        return this.run(name, operation, classify);
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        for (const dispose of this.disposers.splice(0)) this.safe(dispose);
    }
}
