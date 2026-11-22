import { ProtocolResponseError } from './ProtocolValidation';

export type LyricsRequestOptions = { lang?: string; source?: string; type?: 'lyrics' | 'onlyCaptions' };
export type SourceHealthStatus = 'unknown' | 'idle' | 'healthy' | 'degraded' | 'unavailable' | 'rate_limited' | 'restricted' | 'misconfigured';
export interface SourceHealthEntry {
    status: SourceHealthStatus;
    reason?: string | null;
    message?: string;
    recommendedAction?: string | null;
    latency?: { p50: number; p95: number; jitter: number; average?: number };
    successRate?: number;
    circuitBreaker?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    totalRequests?: number;
    consecutiveFailures?: number;
    lastActivityAt?: number | null;
    lastSuccessAt?: number | null;
    lastFailureAt?: number | null;
}
export interface SourceHealthResponse {
    enabled: boolean;
    timestamp: number;
    summary: Record<SourceHealthStatus | 'total', number>;
    sources: Record<string, SourceHealthEntry>;
    probe: {
        enabled: boolean;
        intervalMs: number;
        nextRunAt: number | null;
        lastRunAt: number | null;
        running: boolean;
        currentSources: Array<{ source: string; startedAt: number }>;
        nextSources: string[];
        eligibleSources: number;
    };
}

const statuses = ['unknown','idle','healthy','degraded','unavailable','rate_limited','restricted','misconfigured'] as const;
const obj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const count = (v: unknown): boolean => number(v) && Number.isSafeInteger(v);
const timestamp = (v: unknown): boolean => v === null || number(v);
const optional = (v: unknown, check: (v: unknown) => boolean): boolean => v === undefined || check(v);

/** Validate the public wire contract independently of NodeLink's server implementation. */
export function validateSourceHealth(value: unknown): asserts value is SourceHealthResponse {
    const invalid = (field: string): never => { throw new ProtocolResponseError('source health', field); };
    if (!obj(value) || typeof value.enabled !== 'boolean' || !number(value.timestamp) ||
        !obj(value.summary) || !obj(value.sources) || !obj(value.probe)) throw new ProtocolResponseError('source health', 'envelope');
    const summary = value.summary;
    for (const key of ['total', ...statuses]) if (!count(summary[key])) invalid('summary counters');
    for (const [source, entry] of Object.entries(value.sources)) {
        if (!/^[\w.-]+$/.test(source) || !obj(entry)) throw new ProtocolResponseError('source health', 'source entry');
        validateSourceHealthEntry(entry);

    }
    const p = value.probe;
    if (typeof p.enabled !== 'boolean' || typeof p.running !== 'boolean' || !number(p.intervalMs) ||
        !timestamp(p.nextRunAt) || !timestamp(p.lastRunAt) || !count(p.eligibleSources) ||
        !Array.isArray(p.nextSources) || !p.nextSources.every(v => typeof v === 'string') ||
        !Array.isArray(p.currentSources) || !p.currentSources.every(v => obj(v) && typeof v.source === 'string' && number(v.startedAt))) invalid('probe');
}

export function lyricsParameters(encodedTrack: string, options?: string | LyricsRequestOptions): URLSearchParams {
    if (typeof encodedTrack !== 'string' || !encodedTrack.trim()) throw new TypeError('Lyrics require an encoded track');
    const params = new URLSearchParams({ encodedTrack });
    const request = typeof options === 'string' ? { lang: options } : options ?? {};
    if (!obj(request)) throw new TypeError('Invalid lyrics options');
    for (const key of ['lang','source'] as const) {
        const value = request[key];
        if (value !== undefined) {
            if (typeof value !== 'string') throw new TypeError('Invalid lyrics option: ' + key);
            if (value.trim()) params.set(key, value.trim());
        }
    }
    if (request.type !== undefined) {
        if (request.type !== 'lyrics' && request.type !== 'onlyCaptions') throw new TypeError('Invalid lyrics request type');
        params.set('type', request.type);
    }
    return params;
}

export interface SourceHealthSnapshotEvent {
    op: 'event';
    type: 'SourceHealthSnapshotEvent';
    sources: Record<string, SourceHealthEntry>;
    timestamp?: number;
}
export interface SourceHealthChangeEvent extends SourceHealthEntry {
    op: 'event';
    type: 'SourceHealthChangeEvent';
    source: string;
    previousStatus: SourceHealthStatus;
    timestamp: number;
}
export type SourceHealthEvent = SourceHealthSnapshotEvent | SourceHealthChangeEvent;

export function validateSourceHealthEntry(entry: unknown): asserts entry is SourceHealthEntry {
    if (!obj(entry)) throw new ProtocolResponseError('source health', 'source entry');
    if (!statuses.some(status => status === entry.status) ||
            !optional(entry.successRate, v => number(v) && v <= 100) ||
            !optional(entry.circuitBreaker, v => ['CLOSED','OPEN','HALF_OPEN'].some(state => state === v)) ||
            !optional(entry.latency, v => obj(v) && number(v.p50) && number(v.p95) && number(v.jitter) && optional(v.average, number)) ||
            !optional(entry.totalRequests, count) || !optional(entry.consecutiveFailures, count) ||
            !optional(entry.lastActivityAt, timestamp) || !optional(entry.lastSuccessAt, timestamp) ||
            !optional(entry.lastFailureAt, timestamp) ||
            !optional(entry.message, v => typeof v === 'string') ||
            !optional(entry.reason, v => v === null || typeof v === 'string') ||
            !optional(entry.recommendedAction, v => v === null || typeof v === 'string')) throw new ProtocolResponseError('source health', 'source telemetry');
}
export function validateSourceHealthEvent(value: unknown): asserts value is SourceHealthEvent {
    if (!obj(value) || value.op !== 'event') throw new ProtocolResponseError('source health event', 'envelope');
    if (value.type === 'SourceHealthSnapshotEvent') {
        if (!obj(value.sources) || !optional(value.timestamp, number)) throw new ProtocolResponseError('source health event', 'snapshot');
        for (const [source, entry] of Object.entries(value.sources)) {
            if (!/^[\w.-]+$/.test(source)) throw new ProtocolResponseError('source health event', 'source name');
            validateSourceHealthEntry(entry);
        }
    } else if (value.type === 'SourceHealthChangeEvent') {
        if (typeof value.source !== 'string' || !/^[\w.-]+$/.test(value.source) ||
            !statuses.some(status => status === value.previousStatus) || !number(value.timestamp)) {
            throw new ProtocolResponseError('source health event', 'change');
        }
        validateSourceHealthEntry(value);
    } else throw new ProtocolResponseError('source health event', 'type');
}

/** NodeLink per-player transition options. Durations are milliseconds. */
export interface CrossfadeOptions {
    enabled: boolean;
    duration?: number;
    curve?: 'linear' | 'sine' | 'sinusoidal';
    mode?: 'stream' | 'smart' | 'preload';
    minBufferMs?: number;
    bufferMs?: number;
}

/** Reject invalid controls rather than silently relying on server coercion. */
export function normalizeCrossfade(value: unknown): CrossfadeOptions {
    if (!obj(value) || typeof value.enabled !== 'boolean') throw new TypeError('Crossfade requires an enabled boolean');
    const result: CrossfadeOptions = { enabled: value.enabled };
    for (const key of ['duration','minBufferMs','bufferMs'] as const) {
        const v = value[key];
        if (v === undefined) continue;
        if (!number(v) || !Number.isSafeInteger(v) || v > 30000 || key === 'minBufferMs' && v < 20) throw new TypeError('Invalid crossfade ' + key);
        result[key] = v;
    }
    if (value.curve !== undefined) {
        if (value.curve !== 'linear' && value.curve !== 'sine' && value.curve !== 'sinusoidal') throw new TypeError('Invalid crossfade curve');
        result.curve = value.curve;
    }
    if (value.mode !== undefined) {
        if (value.mode !== 'stream' && value.mode !== 'smart' && value.mode !== 'preload') throw new TypeError('Invalid crossfade mode');
        result.mode = value.mode;
    }
    return result;
}
