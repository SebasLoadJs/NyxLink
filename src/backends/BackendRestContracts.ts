import { BackendDetector } from './BackendDetector';
import type { BackendKind, BackendPlugin } from './BackendAdapter';
import { ProtocolResponseError } from './ProtocolValidation';

export interface BackendInfoSnapshot {
    kind: BackendKind;
    version: string;
    protocolVersion: number;
    buildTime?: number;
    runtime?: string;
    voice?: {
        name: string;
        version: string;
    };
    sourceManagers: string[];
    filters: string[];
    plugins: BackendPlugin[];
    sourceHealthEnabled?: boolean;
}

export interface BackendInfoOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
}

export interface NodeLinkTrackStreamOptions {
    itag?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
}

export interface NodeLinkTrackStreamInfo {
    url?: string;
    protocol?: string;
    format?: string | Record<string, unknown>;
    isLive?: boolean;
    isEncrypted?: boolean;
    newTrack?: Record<string, unknown>;
    trackInfo?: Record<string, unknown>;
    additionalData?: Record<string, unknown>;
}

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
const identifier = /^[a-z0-9][\w.-]*$/i;
function invalid(field: string): never { throw new ProtocolResponseError('backend REST', field); }
export function backendRestTimeout(value?: number): number {
    const timeout = value ?? 10000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw new RangeError('Invalid backend REST timeout');
    return timeout;
}
function names(value: unknown): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 4096 || !value.every(v => text(v,128) && identifier.test(v))) return invalid('capability names');
    return [...new Set<string>(value)];
}
/** A detached view; do not copy server installation paths or arbitrary raw fields. */
export function readBackendInfoSnapshot(value: unknown, headers: Record<string, unknown> = {}): BackendInfoSnapshot {
    if (!record(value)) return invalid('info envelope');
    const adapter = BackendDetector.detect(value, headers);
    if (!adapter) return invalid('backend identity');
    const result: BackendInfoSnapshot = {kind:adapter.kind,version:adapter.version,protocolVersion:adapter.protocolVersion,
        sourceManagers:names(value.sourceManagers),filters:names(value.filters),plugins:adapter.plugins.map(plugin=>({...plugin}))};
    if (typeof value.buildTime === 'number' && Number.isSafeInteger(value.buildTime) && value.buildTime >= 0) result.buildTime = value.buildTime;
    const runtime = adapter.kind === 'nodelink' ? value.node : value.jvm;
    if (text(runtime,256)) result.runtime = runtime;
    if (record(value.voice) && text(value.voice.name,256) && text(value.voice.version,256)) result.voice={name:value.voice.name,version:value.voice.version};
    if (adapter.kind === 'nodelink' && record(value.sourceHealth) && typeof value.sourceHealth.enabled === 'boolean') result.sourceHealthEnabled=value.sourceHealth.enabled;
    return result;
}
export function nodeLinkTrackStreamParameters(encodedTrack: string, options: NodeLinkTrackStreamOptions): URLSearchParams {
    if (!text(encodedTrack,65536) || !encodedTrack.trim()) throw new TypeError('Invalid encoded track');
    const params = new URLSearchParams({encodedTrack});
    if (options.itag !== undefined) {
        if (!Number.isSafeInteger(options.itag) || options.itag < 1 || options.itag > 2147483647) throw new TypeError('Invalid stream itag');
        params.set('itag', String(options.itag));
    }
    return params;
}
/** Provider URLs and additional data can be sensitive. Never fetch or log them here. */
export function readNodeLinkTrackStreamInfo(value: unknown): NodeLinkTrackStreamInfo {
    if (!record(value) || value.exception !== undefined) return invalid('track stream envelope');
    const result: NodeLinkTrackStreamInfo = {};
    for (const key of ['url','protocol'] as const) {
        if (value[key] !== undefined) {
            if (!text(value[key], key === 'url' ? 65536 : 128)) return invalid('track stream ' + key);
            result[key] = value[key];
        }
    }
    if (value.format !== undefined) {
        if (!text(value.format,256) && !record(value.format)) return invalid('track stream format');
        result.format = structuredClone(value.format);
    }
    for (const key of ['isLive','isEncrypted'] as const) {
        if (value[key] !== undefined) {
            if (typeof value[key] !== 'boolean') return invalid('track stream ' + key);
            result[key] = value[key];
        }
    }
    for (const key of ['newTrack','trackInfo','additionalData'] as const) {
        if (value[key] !== undefined) {
            if (!record(value[key])) return invalid('track stream ' + key);
            result[key] = structuredClone(value[key]);
        }
    }
    if (!result.url && !result.protocol && !result.additionalData && !result.newTrack) return invalid('empty track stream metadata');
    return result;
}

export type NodeLinkMetricsAuthorization = {
    type: 'bearer';
    token: string;
} | {
    type: 'basic';
    username: string;
    password: string;
} | {
    type: 'raw';
    password: string;
};

export interface NodeLinkMetricsOptions extends BackendInfoOptions {
    authorization?: NodeLinkMetricsAuthorization;
    allowLoopbackHttp?: boolean;
}

export function nodeLinkMetricsHeader(origin: string, options: NodeLinkMetricsOptions): string | undefined {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && !(options.allowLoopbackHttp === true && ['127.0.0.1','[::1]'].includes(url.hostname))) throw new TypeError('NodeLink metrics require HTTPS or explicitly enabled loopback HTTP');
    const auth = options.authorization;
    if (auth === undefined) return undefined;
    if (!record(auth)) throw new TypeError('Invalid metrics authorization');
    const token = (v: unknown): v is string => typeof v === 'string' && /^[\x21-\x7e]{1,4096}$/.test(v);
    if (auth.type === 'bearer' && token(auth.token)) return 'Bearer ' + auth.token;
    if (auth.type === 'raw' && token(auth.password)) return auth.password;
    if (auth.type === 'basic' && text(auth.username,512) && !auth.username.includes(':') && text(auth.password,4096)) return 'Basic ' + Buffer.from(auth.username + ':' + auth.password, 'utf8').toString('base64');
    throw new TypeError('Invalid metrics authorization');
}
