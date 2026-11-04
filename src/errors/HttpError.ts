/** Preserves v4 status/body: https://lavalink.dev/api/rest#error-responses */
export class HttpError extends Error {
    public readonly retryable: boolean;
    public readonly retryAfterMs?: number;
    constructor(public readonly statusCode: number, public readonly body?: unknown, retryAfter?: string) {
        super(`Server responded with status ${statusCode}`);
        this.name = 'HttpError';
        this.retryable = statusCode === 429 || statusCode >= 500;
        if (typeof retryAfter === 'string') {
            const value = retryAfter.trim();
            const seconds = /^\d+$/.test(value);
            // Accept HTTP weekday dates, including the obsolete asctime form, in GMT.
            const date = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:[a-z]*,|,| )/.test(value);
            const delay = seconds ? Number(value) * 1000 : date
                ? Math.max(0, Date.parse(value.endsWith(' GMT') ? value : `${value} GMT`) - Date.now()) : NaN;
            if (Number.isSafeInteger(delay) && Number.isSafeInteger(Date.now() + delay)) this.retryAfterMs = delay;
        }
    }
}
