import type { LogTransport, StructuredLogRecord } from './StructuredLog';

/** Structural subset of a Node.js Pino logger; the application owns its destination. */
export interface PinoLoggerLike {
    trace(fields: object, message: string): unknown;
    debug(fields: object, message: string): unknown;
    info(fields: object, message: string): unknown;
    warn(fields: object, message: string): unknown;
    error(fields: object, message: string): unknown;
    flush?(callback: (error?: Error) => void): void;
}

/** No imports, global logger, duplicate console output or ownership of the supplied Pino. */
export class PinoLogTransport implements LogTransport {
    constructor(private readonly logger: PinoLoggerLike) {
        if (!logger || ['trace', 'debug', 'info', 'warn', 'error'].some(level => typeof logger[level as keyof PinoLoggerLike] !== 'function')) {
            throw new TypeError('Pino transport requires a Node.js Pino-compatible logger');
        }
    }
    write(record: StructuredLogRecord): void {
        this.logger[record.level]({ nyxlink: record }, record.message);
    }
    flush(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.logger.flush) { resolve(); return; }
            this.logger.flush(error => error ? reject(error) : resolve());
        });
    }
}

export interface TelemetrySpanLike {
    setStatus(status: { code: number; message?: string }): unknown;
    end(endTime?: number): void;
}
export interface TelemetryTracerLike {
    startSpan(name: string, options?: { startTime?: number; attributes?: Record<string, string | number | boolean> }): TelemetrySpanLike;
}
export interface TelemetryCounterLike {
    add(value: number, attributes?: Record<string, string | number | boolean>): void;
}

/** Exports completed observed operations, never fabricates live spans from sampled starts. */
export class OpenTelemetryLogTransport implements LogTransport {
    constructor(private readonly tracer: TelemetryTracerLike, private readonly counter?: TelemetryCounterLike) {
        if (!tracer || typeof tracer.startSpan !== 'function' || counter && typeof counter.add !== 'function') {
            throw new TypeError('Telemetry transport requires an application-owned tracer and optional counter');
        }
    }
    write(record: StructuredLogRecord): void {
        // Fixed attribute vocabulary: no guild, track, URL, raw error or arbitrary context labels.
        this.counter?.add(1, { 'nyxlink.level': record.level });
        if (!['operation.completed', 'operation.failed'].includes(record.event)) return;
        const duration = record.context.durationMs;
        const endTime = Date.parse(record.timestamp);
        if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || !Number.isFinite(endTime)) return;
        const operation = typeof record.context.operation === 'string' ? record.context.operation.slice(0, 128) : 'operation';
        const attributes: Record<string, string | number | boolean> = {
            'nyxlink.duration_ms': duration, 'nyxlink.failed': record.event === 'operation.failed',
        };
        // NyxLink IDs are attributes, not fake W3C parent/span IDs.
        if (typeof record.context.traceId === 'string') attributes['nyxlink.trace_id'] = record.context.traceId.slice(0, 128);
        const span = this.tracer.startSpan('nyxlink.' + operation, { startTime: endTime - duration, attributes });
        try { span.setStatus({ code: record.event === 'operation.failed' ? 2 : 1 }); }
        finally { span.end(endTime); }
    }
}
