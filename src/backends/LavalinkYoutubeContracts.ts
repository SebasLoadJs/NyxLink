import { ProtocolResponseError } from './ProtocolValidation';

export interface LavalinkYoutubeAdminOptions {
    /** Explicitly acknowledge that server responses and logs may contain credentials. */
    allowSensitive: true;
    /** Permit unencrypted requests only on literal loopback addresses. */
    allowLoopbackHttp?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
}
export interface LavalinkYoutubeConfig {
    refreshToken: string | null;
}
export interface LavalinkYoutubeConfigUpdate {
    refreshToken?: string | null;
    skipInitialization?: boolean;
    poToken?: string | null;
    visitorData?: string | null;
}
export interface LavalinkYoutubeOAuthToken {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
}
export interface LavalinkYoutubeStreamOptions {
    itag?: number;
    withClient?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
}
export interface LavalinkYoutubeStream {
    stream: NodeJS.ReadableStream;
    statusCode: number;
    headers: import('node:http').IncomingHttpHeaders;
}
function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
const token = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 16384 && !/[\x00-\x20\x7f]/.test(value);
export function youtubeTimeout(value?: number): number {
    const timeout = value ?? 10000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw new RangeError('Invalid YouTube plugin timeout');
    return timeout;
}
export function assertYoutubeAdmin(origin: string, options: LavalinkYoutubeAdminOptions): void {
    if (!options || options.allowSensitive !== true) throw new TypeError('YouTube administration requires explicit sensitive access');
    const url = new URL(origin);
    if (url.protocol !== 'https:' && !(options.allowLoopbackHttp === true && ['127.0.0.1','[::1]'].includes(url.hostname))) {
        throw new TypeError('YouTube administration requires HTTPS or explicitly enabled loopback HTTP');
    }
    youtubeTimeout(options.timeoutMs);
    options.signal?.throwIfAborted();
}
export function youtubeConfig(value: unknown): LavalinkYoutubeConfig {
    if (!record(value) || !(value.refreshToken === null || token(value.refreshToken))) throw new ProtocolResponseError('YouTube plugin', 'configuration');
    return { refreshToken: value.refreshToken };
}
export function youtubeConfigBody(value: LavalinkYoutubeConfigUpdate): LavalinkYoutubeConfigUpdate {
    if (!record(value) || Object.keys(value).some(k=>!['refreshToken','skipInitialization','poToken','visitorData'].includes(k))) throw new TypeError('Invalid YouTube configuration');
    const result: LavalinkYoutubeConfigUpdate = {};
    if (value.refreshToken !== undefined) {
        if (value.refreshToken !== null && (!token(value.refreshToken) || value.refreshToken === 'x')) throw new TypeError('Invalid YouTube refresh token');
        result.refreshToken = value.refreshToken;
    }
    if (value.skipInitialization !== undefined) {
        if (typeof value.skipInitialization !== 'boolean') throw new TypeError('Invalid YouTube initialization option');
        result.skipInitialization = value.skipInitialization;
    }
    // The server clears PO/visitor data when omitted. Require an explicit pair
    // to prevent an OAuth-only update from silently changing another setting.
    if (!(value.poToken === null && value.visitorData === null) &&
        !(token(value.poToken) && token(value.visitorData))) throw new TypeError('Specify both PO token and visitor data, or both null to clear');
    result.poToken = value.poToken as string | null;
    result.visitorData = value.visitorData as string | null;
    return result;
}
export function youtubeOAuthPath(refreshToken: string): string {
    if (!token(refreshToken) || refreshToken === '.' || refreshToken === '..') throw new TypeError('Invalid YouTube refresh token');
    return '/youtube/oauth/' + encodeURIComponent(refreshToken);
}
export function youtubeOAuthToken(value: unknown): LavalinkYoutubeOAuthToken {
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { throw new ProtocolResponseError('YouTube plugin', 'OAuth response'); }
    }
    if (!record(value) || !token(value.access_token) || typeof value.expires_in !== 'number' ||
        !Number.isSafeInteger(value.expires_in) || value.expires_in <= 0 ||
        typeof value.scope !== 'string' || value.scope.length > 16384 || !token(value.token_type)) {
        throw new ProtocolResponseError('YouTube plugin', 'OAuth response');
    }
    return { access_token: value.access_token, expires_in: value.expires_in, scope: value.scope, token_type: value.token_type };
}
export function youtubeStreamPath(videoId: string, options: LavalinkYoutubeStreamOptions): string {
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new TypeError('Invalid YouTube video ID');
    const params = new URLSearchParams();
    if (options.itag !== undefined) {
        if (!Number.isSafeInteger(options.itag) || options.itag < 1 || options.itag > 2147483647) throw new TypeError('Invalid YouTube itag');
        params.set('itag', String(options.itag));
    }
    if (options.withClient !== undefined) {
        if (typeof options.withClient !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(options.withClient)) throw new TypeError('Invalid YouTube client');
        params.set('withClient', options.withClient);
    }
    const query = params.toString();
    return '/youtube/stream/' + videoId + (query ? '?' + query : '');
}
