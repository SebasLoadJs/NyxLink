export type LyricsRequestOptions = {
    lang?: string;
    source?: string;
    type?: 'lyrics' | 'onlyCaptions';
};
export type SourceHealthStatus = 'unknown' | 'idle' | 'healthy' | 'degraded' | 'unavailable' | 'rate_limited' | 'restricted' | 'misconfigured';
export interface SourceHealthEntry {
    status: SourceHealthStatus;
    reason?: string | null;
    message?: string;
    recommendedAction?: string | null;
    latency?: {
        p50: number;
        p95: number;
        jitter: number;
        average?: number;
    };
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
        currentSources: Array<{
            source: string;
            startedAt: number;
        }>;
        nextSources: string[];
        eligibleSources: number;
    };
}
export declare function validateSourceHealth(value: unknown): asserts value is SourceHealthResponse;
export declare function lyricsParameters(encodedTrack: string, options?: string | LyricsRequestOptions): URLSearchParams;
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
export declare function validateSourceHealthEntry(entry: unknown): asserts entry is SourceHealthEntry;
export declare function validateSourceHealthEvent(value: unknown): asserts value is SourceHealthEvent;
export interface CrossfadeOptions {
    enabled: boolean;
    duration?: number;
    curve?: 'linear' | 'sine' | 'sinusoidal';
    mode?: 'stream' | 'smart' | 'preload';
    minBufferMs?: number;
    bufferMs?: number;
}
export declare function normalizeCrossfade(value: unknown): CrossfadeOptions;
export interface QueuePreloadOptions {
    enabled: boolean;
    leadMs?: number;
}
export interface NodeLinkStreamFormat {
    itag: number | null;
    type: 'audio' | 'video' | 'muxed' | null;
    format: string | null;
    codec: string | null;
    mimeType: string | null;
    bitrate: number | null;
    quality: string | null;
    width: number | null;
    height: number | null;
    fps: number | null;
    contentLength: number | null;
}
export interface NodeLinkStreamFormats {
    source: string;
    protocol: string;
    format: string | null;
    mimeType: string;
    itag: number | null;
    seekable: boolean;
    byteRangeSupported: boolean;
    formats: NodeLinkStreamFormat[];
}
export declare function validateNodeLinkStreamFormats(value: unknown): asserts value is NodeLinkStreamFormats;
