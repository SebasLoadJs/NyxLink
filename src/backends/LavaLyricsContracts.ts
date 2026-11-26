import { ProtocolResponseError } from './ProtocolValidation';

/** LavaLyrics (Lavalink v4 plugin) wire format; distinct from NodeLink /loadlyrics. */
export interface LavaLyricsLine {
    timestamp: number;
    duration: number | null;
    line: string;
    plugin: Record<string, unknown>;
}
export interface LavaLyricsData {
    sourceName: string;
    provider: string;
    text: string | null;
    lines: LavaLyricsLine[];
    plugin: Record<string, unknown>;
}
export interface LavaLyricsOptions {
    skipTrackSource?: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function milliseconds(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Validate before returning remote JSON to callers or recording observed support. */
export function validateLavaLyrics(value: unknown): asserts value is LavaLyricsData {
    if (!record(value) || typeof value.sourceName !== 'string' || !value.sourceName.trim() ||
        typeof value.provider !== 'string' || !value.provider.trim() ||
        !(value.text === null || typeof value.text === 'string') ||
        !Array.isArray(value.lines) || !record(value.plugin)) {
        throw new ProtocolResponseError('LavaLyrics', 'lyrics envelope');
    }
    for (const line of value.lines) {
        if (!record(line) || !milliseconds(line.timestamp) ||
            !(line.duration === null || milliseconds(line.duration)) ||
            typeof line.line !== 'string' || !record(line.plugin)) {
            throw new ProtocolResponseError('LavaLyrics', 'lyrics line');
        }
    }
}

/** Explicit contract: do not use NodeLink's `encodedTrack`, `lang`, or `source` query. */
export function lavaLyricsParameters(encodedTrack: string, options?: LavaLyricsOptions): URLSearchParams {
    if (typeof encodedTrack !== 'string' || !encodedTrack.trim() || encodedTrack.length > 65536) {
        throw new TypeError('LavaLyrics requires a nonempty encoded track');
    }
    if (options !== undefined && (!record(options) ||
        (options.skipTrackSource !== undefined && typeof options.skipTrackSource !== 'boolean'))) {
        throw new TypeError('Invalid LavaLyrics options');
    }
    const params = new URLSearchParams({ track: encodedTrack });
    if (options?.skipTrackSource !== undefined) params.set('skipTrackSource', String(options.skipTrackSource));
    return params;
}

/** The advertised plugin name varies by distribution; never infer support from unrelated plugins. */
export function hasLavaLyricsPlugin(plugins: readonly { name: string }[]): boolean {
    return plugins.some(plugin => plugin.name.toLowerCase() === 'lavalyrics' ||
        plugin.name.toLowerCase() === 'lavalyrics-plugin');
}

/** Current-track and live subscriptions have no encoded-track parameter. */
export function lavaLyricsPlayerParameters(options?: LavaLyricsOptions): URLSearchParams {
    const params = lavaLyricsParameters('current-track', options);
    params.delete('track');
    return params;
}
