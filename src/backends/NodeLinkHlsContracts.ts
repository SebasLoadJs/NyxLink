import { randomUUID } from 'node:crypto';
import { ProtocolResponseError } from './ProtocolValidation';

export interface NodeLinkHlsOptions {
    volume?: number;
    segmentDuration?: number;
    filters?: Record<string, unknown>;
    signal?: AbortSignal;
    timeoutMs?: number;
}
export interface NodeLinkHlsReadOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}
export interface NodeLinkHlsManifest {
    sessionId: string;
    playlist: string;
}
export function hlsSessionId(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new TypeError('Invalid HLS session ID');
}
export function hlsTimeout(value?: number): number {
    const timeout = value ?? 30000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw new RangeError('Invalid HLS timeout');
    return timeout;
}
export function hlsCreateQuery(encodedTrack: string, options: NodeLinkHlsOptions): { sessionId: string; query: URLSearchParams } {
    if (typeof encodedTrack !== 'string' || !encodedTrack.trim() || encodedTrack.length > 16384 || /[\x00-\x20\x7f]/.test(encodedTrack)) throw new TypeError('Invalid HLS encoded track');
    const sessionId = randomUUID();
    const query = new URLSearchParams({ encodedTrack, sessionId });
    if (options.volume !== undefined) {
        if (!Number.isFinite(options.volume) || options.volume < 0 || options.volume > 1000) throw new TypeError('Invalid HLS volume');
        query.set('volume', String(options.volume));
    }
    if (options.segmentDuration !== undefined) {
        if (!Number.isFinite(options.segmentDuration) || options.segmentDuration < 1 || options.segmentDuration > 15) throw new TypeError('Invalid HLS segment duration');
        query.set('segmentDuration', String(options.segmentDuration));
    }
    if (options.filters !== undefined) {
        if (!options.filters || typeof options.filters !== 'object' || Array.isArray(options.filters)) throw new TypeError('Invalid HLS filters');
        const filters = JSON.stringify(options.filters);
        if (!filters || Buffer.byteLength(filters) > 4096) throw new TypeError('HLS filters too large');
        query.set('filters', filters);
    }
    if (query.toString().length > 24000) throw new TypeError('HLS request exceeds URL limit');
    return { sessionId, query };
}
export function hlsReadQuery(sessionId: string, index?: number): URLSearchParams {
    hlsSessionId(sessionId);
    const query = new URLSearchParams({ sessionId });
    if (index !== undefined) {
        if (!Number.isSafeInteger(index) || index < 0 || index > 1000000) throw new TypeError('Invalid HLS segment index');
        query.set('segment', String(index));
    }
    return query;
}
/** The SDK never follows manifest URLs. Validate the exact native relative URI contract. */
export function validateHlsManifest(value: string, sessionId: string): NodeLinkHlsManifest {
    const lines = value.split(/\r?\n/).filter(Boolean);
    if (lines[0] !== '#EXTM3U' || lines.length > 250000) throw new ProtocolResponseError('NodeLink HLS', 'manifest');
    let map = false;
    const validUri = (raw: string, file: string): boolean => {
        if (!raw.startsWith(file + '?')) return false;
        const query = new URLSearchParams(raw.slice(file.length + 1));
        if (query.getAll('sessionId').length !== 1 || query.get('sessionId') !== sessionId ||
            [...query.keys()].some(key=>!['sessionId','segment','_v'].includes(key))) return false;
        if (file === 'init.mp4') return !query.has('segment');
        const seq = query.get('segment');
        return query.getAll('segment').length === 1 && seq !== null && /^\d{1,7}$/.test(seq) && Number(seq) <= 1000000;
    };
    for (const line of lines.slice(1)) {
        if (line.startsWith('#EXT-X-MAP:')) {
            const match = /^#EXT-X-MAP:URI="([^"]+)"$/.exec(line);
            if (map || !match || !validUri(match[1], 'init.mp4')) throw new ProtocolResponseError('NodeLink HLS', 'init URI');
            map = true;
        } else if (!line.startsWith('#')) {
            if (!validUri(line, 'segment.m4s')) throw new ProtocolResponseError('NodeLink HLS', 'segment URI');
        } else if (/URI\s*=/i.test(line)) {
            throw new ProtocolResponseError('NodeLink HLS', 'unsupported URI tag');
        }
    }
    if (!map) throw new ProtocolResponseError('NodeLink HLS', 'missing init URI');
    return { sessionId, playlist: value };
}
