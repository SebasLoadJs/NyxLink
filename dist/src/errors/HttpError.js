"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
class HttpError extends Error {
    statusCode;
    body;
    retryable;
    retryAfterMs;
    constructor(statusCode, body, retryAfter) {
        super(`Server responded with status ${statusCode}`);
        this.statusCode = statusCode;
        this.body = body;
        this.name = 'HttpError';
        this.retryable = statusCode === 429 || statusCode >= 500;
        if (typeof retryAfter === 'string') {
            const value = retryAfter.trim();
            const seconds = /^\d+$/.test(value);
            const date = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:[a-z]*,|,| )/.test(value);
            const delay = seconds ? Number(value) * 1000 : date
                ? Math.max(0, Date.parse(value.endsWith(' GMT') ? value : `${value} GMT`) - Date.now()) : NaN;
            if (Number.isSafeInteger(delay) && Number.isSafeInteger(Date.now() + delay))
                this.retryAfterMs = delay;
        }
    }
}
exports.HttpError = HttpError;
//# sourceMappingURL=HttpError.js.map