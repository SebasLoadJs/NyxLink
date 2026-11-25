export declare class HttpError extends Error {
    readonly statusCode: number;
    readonly body?: unknown;
    readonly retryable: boolean;
    readonly retryAfterMs?: number;
    constructor(statusCode: number, body?: unknown, retryAfter?: string);
}
