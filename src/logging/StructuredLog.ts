import { redactSecrets } from './LogFormatter';
import type { NyxLogLevel } from './LogLevels';
import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';

export type LogContext = Readonly<Record<string, unknown>>;
export interface StructuredLogRecord {
    readonly schemaVersion: 1;
    readonly sequence: number;
    readonly timestamp: string;
    readonly level: Exclude<NyxLogLevel, 'silent'>;
    readonly component: string;
    readonly event: string;
    readonly message: string;
    readonly context: LogContext;
}
export interface LogTransport {
    write(record: StructuredLogRecord): void | Promise<void>;
    flush?(): void | Promise<void>;
    close?(): void | Promise<void>;
}
export interface LogPipelineStats {
    accepted: number;
    written: number;
    dropped: number;
    droppedCritical: number;
    transportErrors: number;
    sampled: number;
    suppressed: number;
    queued: number;
    closed: boolean;
}

const sensitive = /^(?:authorization|proxyauthorization|auth|credentials|password|passwd|passphrase|token|accesstoken|refreshtoken|bottoken|discordtoken|voicetoken|bearertoken|apikey|clientsecret|privatekey|secretkey|secret|sessionid|session|cookie|setcookie|userdata|body|requestbody|responsebody|rawpayload|gatewaypayload|voicepayload)$/i;
const strip = (text: string) => text.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');

/** Bounded, getter-free serialization. Never changes or retains caller objects. */
export function safeLogValue(value: unknown): unknown {
    const seen = new WeakSet<object>();
    let budget = 256;
    const visit = (item: unknown, depth: number): unknown => {
        if (--budget < 0) return '[Truncated]';
        if (typeof item === 'string') return strip(redactSecrets(item)).slice(0, 4096);
        if (typeof item === 'number') return Number.isFinite(item) ? item : String(item);
        if (typeof item === 'bigint') return String(item);
        if (item === null || typeof item === 'boolean') return item;
        if (item === undefined) return null;
        if (typeof item !== 'object') return `[${typeof item}]`;
        if (seen.has(item)) return '[Circular]';
        if (depth >= 6) return '[MaxDepth]';
        seen.add(item);
        try {
            if (item instanceof Date) {
                const timestamp = Date.prototype.getTime.call(item);
                return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '[InvalidDate]';
            }
            const output: Record<string, unknown> = Object.create(null);
            const keys = item instanceof Error ? ['name', 'message', 'stack', 'cause'] : [];
            for (const key in item) {
                if (Object.prototype.hasOwnProperty.call(item, key) && !keys.includes(key)) keys.push(key);
                if (keys.length >= 64) break;
            }
            for (const key of keys) {
                if (key === 'length' && Array.isArray(item)) continue;
                const descriptor = Object.getOwnPropertyDescriptor(item, key);
                if (!descriptor && key !== 'name') continue;
                const field = strip(redactSecrets(key)).slice(0, 128);
                output[field] = sensitive.test(key.replace(/[^a-z]/gi, '')) ? '[REDACTED]' :
                    !descriptor ? 'Error' : 'value' in descriptor ? visit(descriptor.value, depth + 1) : '[Accessor]';
            }
            if (Array.isArray(item)) return Object.values(output);
            return output;
        } catch {
            return '[Unserializable]';
        } finally { seen.delete(item); }
    };
    return visit(value, 0);
}

export function safeLogText(value: unknown): string {
    const safe = safeLogValue(value);
    return typeof safe === 'string' ? safe : JSON.stringify(safe);
}

function freeze<T>(value: T): T {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
}

export interface LogPipelineOptions {
    transports: readonly LogTransport[];
    maxQueue?: number;
    timelineLimit?: number;
    transportTimeoutMs?: number;
    onTransportError?: (error: Error) => void;
    /** Applies only to debug/trace; warnings and errors are never sampled. */
    sampleRate?: number;
    /** Optional grouping of repeated info/debug/trace events, with summaries. */
    deduplicateMs?: number;
}

/** One bounded queue shared by child loggers, without background polling. */
export class LogPipeline {
    private readonly transports: readonly LogTransport[];
    private readonly maxQueue: number;
    private readonly timelineLimit: number;
    private readonly timeout: number;
    private readonly queue: StructuredLogRecord[] = [];
    private readonly history: StructuredLogRecord[] = [];
    private readonly failedTransports = new Set<LogTransport>();
    private readonly repeated = new Map<string, { record: StructuredLogRecord; at: number; count: number }>();
    private readonly correlation = new AsyncLocalStorage<LogContext>();
    private readonly sampleRate: number;
    private readonly deduplicateMs: number;
    private draining?: Promise<void>;
    private closing?: Promise<void>;
    private sequence = 0;
    private readonly counters: LogPipelineStats = { accepted: 0, written: 0, dropped: 0, droppedCritical: 0, transportErrors: 0, sampled: 0, suppressed: 0, queued: 0, closed: false };

    constructor(private readonly options: LogPipelineOptions) {
        const integer = (value: number, min: number, max: number, label: string) => {
            if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`Invalid ${label}`);
            return value;
        };
        this.maxQueue = integer(options.maxQueue ?? 256, 1, 10000, 'log queue capacity');
        this.timelineLimit = integer(options.timelineLimit ?? 0, 0, 10000, 'log timeline capacity');
        this.timeout = integer(options.transportTimeoutMs ?? 1000, 1, 30000, 'log transport timeout');
        this.sampleRate = options.sampleRate ?? 1;
        if (!Number.isFinite(this.sampleRate) || this.sampleRate < 0 || this.sampleRate > 1) throw new TypeError('Invalid log sample rate');
        this.deduplicateMs = integer(options.deduplicateMs ?? 0, 0, 60000, 'log deduplication window');
        if (!Array.isArray(options.transports) || options.transports.some(t => !t || typeof t.write !== 'function')) throw new TypeError('Invalid log transport');
        this.transports = [...new Set(options.transports)];
    }

    emit(level: StructuredLogRecord['level'], component: string, event: string, message: string, context: LogContext = {}): void {
        if (this.counters.closed) return;
        if ((level === 'debug' || level === 'trace') && this.sampleRate < 1 && Math.random() >= this.sampleRate) {
            this.counters.sampled++;
            return;
        }
        let safeContext = safeLogValue(context) as LogContext;
        let safeMessage = safeLogText(message);
        if (JSON.stringify(safeContext).length + safeMessage.length > 16384) {
            safeContext = { truncated: true };
            safeMessage = safeMessage.slice(0, 4096);
        }
        const record = freeze<StructuredLogRecord>({
            schemaVersion: 1, sequence: 0, timestamp: new Date().toISOString(), level,
            component: safeLogText(component).replace(/[\r\n]/g, ' ').slice(0, 128),
            event: safeLogText(event).replace(/[\r\n]/g, ' ').slice(0, 128),
            message: safeMessage, context: safeContext,
        });
        if (this.deduplicateMs > 0 && level !== 'warn' && level !== 'error') {
            const key = JSON.stringify([level, record.component, record.event, record.message, record.context]);
            const now = performance.now(), previous = this.repeated.get(key);
            if (previous && now - previous.at < this.deduplicateMs) {
                previous.count++;
                this.counters.suppressed++;
                return;
            }
            if (previous) this.summarize(previous);
            if (this.repeated.size >= 128 && !this.repeated.has(key)) {
                const oldest = this.repeated.keys().next().value!;
                this.summarize(this.repeated.get(oldest)!);
                this.repeated.delete(oldest);
            }
            this.repeated.set(key, { record, at: now, count: 0 });
        }
        this.enqueue(record);
    }

    private summarize(entry: { record: StructuredLogRecord; count: number }): void {
        if (!entry.count) return;
        this.enqueue(freeze<StructuredLogRecord>({ ...entry.record, sequence: 0, timestamp: new Date().toISOString(),
            event: 'log.repeated', message: 'Repeated log events grouped',
            context: { ...entry.record.context, originalEvent: entry.record.event, count: entry.count },
        }));
        entry.count = 0;
    }

    private enqueue(record: StructuredLogRecord): void {
        record = freeze({ ...record, sequence: ++this.sequence });
        const { level } = record;
        this.counters.accepted++;
        if (this.timelineLimit > 0 && record.event !== 'player.trace') {
            this.history.push(record);
            if (this.history.length > this.timelineLimit) this.history.shift();
        }
        if (this.queue.length >= this.maxQueue) {
            const replace = level === 'error' || level === 'warn' ? this.queue.findIndex(r => r.level !== 'error' && r.level !== 'warn') : -1;
            const dropped = replace >= 0 ? this.queue.splice(replace, 1)[0] : record;
            this.counters.dropped++;
            if (dropped.level === 'error' || dropped.level === 'warn') this.counters.droppedCritical++;
            if (replace < 0) return;
        }
        this.queue.push(record);
        this.startDrain();
    }

    private startDrain(): void {
        if (this.draining) return;
        this.draining = Promise.resolve().then(async () => {
            while (this.queue.length) {
                const record = this.queue.shift()!;
                const delivered = await Promise.all(this.transports.map(async transport => {
                    if (this.failedTransports.has(transport)) return false;
                    const success = await this.invoke(() => transport.write(record));
                    if (!success) this.failedTransports.add(transport);
                    return success;
                }));
                if (delivered.some(Boolean)) this.counters.written++;
                else {
                    this.counters.dropped++;
                    if (record.level === 'error' || record.level === 'warn') this.counters.droppedCritical++;
                }
            }
        }).finally(() => {
            this.draining = undefined;
            if (this.queue.length) this.startDrain();
        });
    }

    private async invoke(action: () => void | Promise<void>): Promise<boolean> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const result = action();
            if (result && typeof result.then === 'function') {
                await Promise.race([result, new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Log transport timed out')), this.timeout);
                })]);
            }
            return true;
        } catch (error) {
            this.counters.transportErrors++;
            try { this.options.onTransportError?.(new Error(safeLogText(error))); } catch { /* observer failure */ }
            return false;
        } finally { if (timer) clearTimeout(timer); }
    }

    stats(): Readonly<LogPipelineStats> { return { ...this.counters, queued: this.queue.length }; }

    context(): LogContext { return this.correlation.getStore() ?? {}; }
    run<T>(context: LogContext, operation: () => T): T { return this.correlation.run(context, operation); }

    timeline(filter: { traceId?: string; guildId?: string; limit?: number } = {}): StructuredLogRecord[] {
        const limit = filter.limit ?? this.timelineLimit;
        if (!Number.isSafeInteger(limit) || limit < 0 || limit > 10000) throw new TypeError('Invalid timeline limit');
        if (!limit) return [];
        return this.history.filter(record => (filter.traceId === undefined || record.context.traceId === filter.traceId) &&
            (filter.guildId === undefined || record.context.guildId === filter.guildId)).slice(-limit);
    }

    async flush(): Promise<void> {
        for (const entry of this.repeated.values()) this.summarize(entry);
        while (this.draining) await this.draining;
        await Promise.all(this.transports.filter(t => !this.failedTransports.has(t)).map(transport => this.invoke(() => transport.flush?.())));
    }

    close(): Promise<void> {
        if (this.closing) return this.closing;
        this.counters.closed = true;
        this.closing = this.flush().then(async () => {
            await Promise.all(this.transports.map(transport => this.invoke(() => transport.close?.())));
            this.history.length = 0;
            this.repeated.clear();
            this.correlation.disable();
        });
        return this.closing;
    }
}
