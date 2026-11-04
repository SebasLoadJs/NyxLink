"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryJitter = retryJitter;
exports.retryDelay = retryDelay;
function retryJitter(value = 0) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new TypeError('retryJitter must be a number between 0 and 1');
    }
    return value;
}
function retryDelay(baseMs, attempt, jitter, maximumMs) {
    const delay = Math.min(Math.max(0, baseMs) * Math.pow(2, attempt), maximumMs);
    return jitter === 0 ? delay : Math.floor(delay * (1 - jitter + jitter * Math.random()));
}
//# sourceMappingURL=RetryDelay.js.map