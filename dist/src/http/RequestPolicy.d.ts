import type { OutgoingHttpHeaders } from 'node:http';
export declare function providerSignal(signal?: AbortSignal): AbortSignal;
export declare function requestHeaders(input?: OutgoingHttpHeaders | readonly string[]): OutgoingHttpHeaders;
export declare function requestUrl(input: string, allowedOrigins?: readonly string[], base?: string): URL;
export declare function publicRedirectHeaders(headers: OutgoingHttpHeaders): OutgoingHttpHeaders;
export declare function providerUrl(path: string, base: string): string;
