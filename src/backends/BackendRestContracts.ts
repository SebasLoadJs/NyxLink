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

export type NodeLinkConnectionQuality = 'unknown' | 'good' | 'average' | 'bad' | 'disconnected';

export type NodeLinkConnectionSnapshot = {
    status: 'disabled';
    metrics: null;
    reason: 'connection_manager_unavailable_in_this_process';
} | {
    status: NodeLinkConnectionQuality;
    metrics: {
        timestamp: number;
        speed?: {
            bps: number;
            kbps: number;
            mbps: number;
        };
        downloadedBytes?: number;
        durationSeconds?: number;
        latencyMs?: number;
        dns?: {
            isOnline: boolean;
            latencyMs?: number;
        };
        ping?: {
            alive: boolean;
            minMs?: number;
            avgMs?: number;
            maxMs?: number;
            packetLoss?: number;
        };
        network?: {
            isConnected: boolean;
            connectionType: 'wifi' | 'ethernet' | 'mobile' | 'unknown';
        };
    };
};

export interface NodeLinkTrackEncodeInput {
    title: string;
    author: string;
    length: number;
    identifier: string;
    isStream: boolean;
    uri: string | null;
    artworkUrl: string | null;
    isrc: string | null;
    sourceName: string;
    position: number;
    details: Array<string | null>;
}

const finiteNonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const connectionQualities: readonly NodeLinkConnectionQuality[] = ['unknown','good','average','bad','disconnected'];
/** Operational projection, deliberately excluding private network addresses and hostnames. */
export function readNodeLinkConnectionSnapshot(value: unknown): NodeLinkConnectionSnapshot {
    if (!record(value)) return invalid('connection envelope');
    if (value.status === 'disabled') {
        if (value.metrics !== null || value.reason !== 'connection_manager_unavailable_in_this_process') return invalid('disabled connection');
        return {status:'disabled',metrics:null,reason:'connection_manager_unavailable_in_this_process'};
    }
    if (!connectionQualities.includes(value.status as NodeLinkConnectionQuality) || !record(value.metrics) ||
        !finiteNonnegative(value.metrics.timestamp)) return invalid('connection metrics');
    const raw = value.metrics;
    const metrics: NonNullable<NodeLinkConnectionSnapshot['metrics']> = {timestamp:raw.timestamp as number};
    for (const key of ['downloadedBytes','durationSeconds','latencyMs'] as const) if (raw[key] !== undefined) {
        if (!finiteNonnegative(raw[key])) return invalid('connection '+key);
        metrics[key] = raw[key];
    }
    if (raw.speed !== undefined) {
        if (!record(raw.speed) || !finiteNonnegative(raw.speed.bps) || !finiteNonnegative(raw.speed.kbps) || !finiteNonnegative(raw.speed.mbps)) return invalid('connection speed');
        metrics.speed = {bps:raw.speed.bps,kbps:raw.speed.kbps,mbps:raw.speed.mbps};
    }
    if (raw.dns !== undefined) {
        if (!record(raw.dns) || typeof raw.dns.isOnline !== 'boolean') return invalid('connection DNS');
        metrics.dns = {isOnline:raw.dns.isOnline};
        if (raw.dns.latencyMs !== undefined) {
            if (!finiteNonnegative(raw.dns.latencyMs)) return invalid('connection DNS latency');
            metrics.dns.latencyMs = raw.dns.latencyMs;
        }
    }
    if (raw.ping !== undefined) {
        if (!record(raw.ping) || typeof raw.ping.alive !== 'boolean') return invalid('connection ping');
        metrics.ping = {alive:raw.ping.alive};
        for (const key of ['minMs','avgMs','maxMs','packetLoss'] as const) if (raw.ping[key] !== undefined) {
            if (!finiteNonnegative(raw.ping[key]) || key === 'packetLoss' && raw.ping[key] > 100) return invalid('connection ping '+key);
            metrics.ping[key] = raw.ping[key];
        }
    }
    if (raw.network !== undefined) {
        if (!record(raw.network) || typeof raw.network.isConnected !== 'boolean' || !['wifi','ethernet','mobile','unknown'].includes(raw.network.connectionType as string)) return invalid('connection network');
        metrics.network = {isConnected:raw.network.isConnected,connectionType:raw.network.connectionType as NonNullable<typeof metrics.network>['connectionType']};
    }
    return {status:value.status as NodeLinkConnectionQuality,metrics};
}
export function nodeLinkEncodeInput(value: NodeLinkTrackEncodeInput): NodeLinkTrackEncodeInput {
    const nullable = (v: unknown): v is string | null => v === null || typeof v === 'string' && Buffer.byteLength(v) <= 16384;
    if (!record(value) || !text(value.title,16384) || !text(value.author,16384) ||
        !text(value.identifier,16384) || !text(value.sourceName,128) ||
        !Number.isSafeInteger(value.length) || value.length < 0 || !Number.isSafeInteger(value.position) || value.position < 0 ||
        typeof value.isStream !== 'boolean' || !nullable(value.uri) || !nullable(value.artworkUrl) || !nullable(value.isrc) ||
        !Array.isArray(value.details) || value.details.length > 128 || !value.details.every(nullable)) throw new TypeError('Invalid NodeLink track encoding input');
    const result = {title:value.title,author:value.author,length:value.length,identifier:value.identifier,isStream:value.isStream,
        uri:value.uri,artworkUrl:value.artworkUrl,isrc:value.isrc,sourceName:value.sourceName,position:value.position,details:[...value.details]};
    if (Buffer.byteLength(JSON.stringify(result)) > 65536) throw new TypeError('NodeLink track encoding input too large');
    return result;
}
export function readNodeLinkEncodedTrack(value: unknown): string {
    if (typeof value !== 'string' || value.length < 4 || value.length > 262144 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return invalid('encoded track');
    return value;
}
export function readNodeLinkEncodedTracks(value: unknown, expected: number): string[] {
    if (!Array.isArray(value) || value.length !== expected) return invalid('encoded track count');
    return value.map(readNodeLinkEncodedTrack);
}

export type NodeLinkJsonValue = string | number | boolean | null | NodeLinkJsonValue[] | { [key: string]: NodeLinkJsonValue };
export type NodeLinkMeaningResult = { loadType: 'meaning'; data: NodeLinkJsonValue } | { loadType: 'empty'; data: Record<string, never> };

function copyProviderJson(value: unknown, depth=0, budget={remaining:20000}): NodeLinkJsonValue {
    if (--budget.remaining < 0 || depth > 32) return invalid('provider payload complexity');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string' && value.length <= 262144) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(item=>copyProviderJson(item,depth+1,budget));
    if (!record(value)) return invalid('provider JSON value');
    const entries = Object.entries(value).map(([key,item])=>{
        if (key.length > 512 || ['__proto__','constructor','prototype'].includes(key)) return invalid('provider JSON key');
        return [key,copyProviderJson(item,depth+1,budget)] as const;
    });
    return Object.fromEntries(entries);
}
export function nodeLinkMediaQuery(encodedTrack: string, language?: string): URLSearchParams {
    if (!text(encodedTrack,65536) || !encodedTrack.trim()) throw new TypeError('Invalid encoded track');
    const params = new URLSearchParams({encodedTrack});
    if (language !== undefined) {
        if (!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8}){0,4}$/.test(language)) throw new TypeError('Invalid meaning language');
        params.set('lang',language);
    }
    return params;
}
export function readNodeLinkMeaningResult(value: unknown): NodeLinkMeaningResult {
    if (!record(value)) return invalid('meaning envelope');
    if (value.loadType === 'empty' && record(value.data) && Object.keys(value.data).length===0) return {loadType:'empty',data:{}};
    if (value.loadType !== 'meaning') return invalid('meaning result');
    return {loadType:'meaning',data:copyProviderJson(value.data)};
}
export function readNodeLinkChapters(value: unknown): import('../typings/Interfaces').IChapter[] {
    if (!Array.isArray(value) || value.length>4096) return invalid('chapter array');
    return value.map(item=>{
        if (!record(item) || !text(item.title,4096) || !finiteNonnegative(item.startTime)) return invalid('chapter');
        const chapter: import('../typings/Interfaces').IChapter={title:item.title,startTime:item.startTime};
        for (const key of ['endTime','duration'] as const) if (item[key]!==undefined) {
            if (!finiteNonnegative(item[key]) || key==='endTime' && item[key]<item.startTime) return invalid('chapter '+key);
            chapter[key]=item[key];
        }
        if (item.thumbnails!==undefined) {
            if (!Array.isArray(item.thumbnails)||item.thumbnails.length>128) return invalid('chapter thumbnails');
            chapter.thumbnails=item.thumbnails.map(image=>{
                if (!record(image)||!text(image.url,8192)||!finiteNonnegative(image.width)||!finiteNonnegative(image.height)) return invalid('chapter thumbnail');
                let url:URL;try{url=new URL(image.url);}catch{return invalid('chapter thumbnail URL');}
                if (!['https:','http:'].includes(url.protocol)||url.username||url.password) return invalid('chapter thumbnail URL');
                return {url:image.url,width:image.width,height:image.height};
            });
        }
        return chapter;
    });
}
