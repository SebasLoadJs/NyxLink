"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeCircuitBreaker = void 0;
const HttpError_1 = require("../errors/HttpError");
const CircuitOpenError_1 = require("../errors/CircuitOpenError");
class NodeCircuitBreaker {
    enabled;
    options;
    status = 'closed';
    generation = 0;
    failures = 0;
    windowStart = 0;
    nextProbe = 0;
    constructor(options) {
        if (options !== undefined && options !== false && (!options || typeof options !== 'object' || Array.isArray(options))) {
            throw new TypeError('Invalid circuit breaker options');
        }
        this.enabled = options !== undefined && options !== false;
        const { failureThreshold = 3, windowMs = 30000, cooldownMs = 30000 } = options || {};
        this.options = { failureThreshold, windowMs, cooldownMs };
        for (const [name, value] of Object.entries(this.options)) {
            const maximum = name === 'failureThreshold' ? 100 : 3600000;
            if (!Number.isInteger(value) || value < 1 || value > maximum)
                throw new TypeError(`Invalid circuit breaker ${name}`);
        }
    }
    get state() { return this.status; }
    get retryAt() { return this.nextProbe; }
    open() {
        this.status = 'open';
        this.nextProbe = Date.now() + this.options.cooldownMs;
        this.generation++;
    }
    failure(error) {
        if (error instanceof HttpError_1.HttpError)
            return error.retryable;
        const code = error?.code;
        return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'].includes(code ?? '');
    }
    async run(operation) {
        if (!this.enabled)
            return operation();
        if (this.status === 'half-open' || this.status === 'open' && Date.now() < this.nextProbe) {
            throw new CircuitOpenError_1.CircuitOpenError(this.nextProbe);
        }
        if (this.status === 'open') {
            this.status = 'half-open';
            this.generation++;
        }
        const generation = this.generation;
        try {
            const result = await operation();
            if (generation === this.generation) {
                if (this.status === 'half-open') {
                    this.status = 'closed';
                    this.generation++;
                }
                this.failures = 0;
                this.nextProbe = 0;
            }
            return result;
        }
        catch (error) {
            if (generation === this.generation) {
                if (this.status === 'half-open')
                    this.open();
                else if (this.failure(error)) {
                    const now = Date.now();
                    if (!this.failures || now - this.windowStart >= this.options.windowMs) {
                        this.failures = 0;
                        this.windowStart = now;
                    }
                    if (++this.failures >= this.options.failureThreshold)
                        this.open();
                }
            }
            throw error;
        }
    }
}
exports.NodeCircuitBreaker = NodeCircuitBreaker;
//# sourceMappingURL=NodeCircuitBreaker.js.map