import type { OutgoingHttpHeaders } from 'node:http';
import { HttpPolicyError } from '../errors/HttpPolicyError';

/** Socket inactivity alone does not bound a provider that keeps sending bytes. */
export function providerSignal(signal?: AbortSignal): AbortSignal {
    const deadline = AbortSignal.timeout(10000);
    return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

export function requestHeaders(input?: OutgoingHttpHeaders | readonly string[]): OutgoingHttpHeaders {
    if (!input) return {};
    if (!Array.isArray(input)) return { ...input as OutgoingHttpHeaders };
    if (input.length % 2 !== 0) throw new TypeError('Raw HTTP headers require name/value pairs');
    return Object.fromEntries(Array.from({ length: input.length / 2 }, (_, index) => [input[index * 2], input[index * 2 + 1]]));
}

export function requestUrl(input: string, allowedOrigins?: readonly string[], base?: string): URL {
    let url: URL;
    try { url = new URL(input, base); } catch { throw new HttpPolicyError('scheme'); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new HttpPolicyError('scheme');
    if (url.username || url.password) throw new HttpPolicyError('credentials');
    if (allowedOrigins !== undefined && (!Array.isArray(allowedOrigins) || !allowedOrigins.includes(url.origin))) throw new HttpPolicyError('origin');
    return url;
}

export function publicRedirectHeaders(headers: OutgoingHttpHeaders): OutgoingHttpHeaders {
    return Object.fromEntries(Object.entries(headers).filter(([name]) =>
        !['authorization', 'proxy-authorization', 'cookie', 'cookie2'].includes(name.toLowerCase())));
}

/** Provider pagination paths cannot introduce another origin, userinfo or protocol. */
export function providerUrl(path: string, base: string): string {
    if (typeof path !== 'string' || !path) throw new HttpPolicyError('scheme');
    const origin = new URL(base).origin;
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//');
    const url = requestUrl(absolute ? path : `${base}${path}`, [origin], base);
    const prefix = new URL(base).pathname.replace(/\/$/, '');
    if (prefix && url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) throw new HttpPolicyError('origin');
    return url.href;
}
