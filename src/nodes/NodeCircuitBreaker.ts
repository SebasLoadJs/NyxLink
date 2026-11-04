import { HttpError } from '../errors/HttpError';
import { CircuitOpenError } from '../errors/CircuitOpenError';

export type CircuitBreakerOptions = { failureThreshold?: number; windowMs?: number; cooldownMs?: number };
export type CircuitState = 'closed' | 'open' | 'half-open';

/** Per-node, bounded state. Requests from an older generation cannot close a newer circuit. */
export class NodeCircuitBreaker {
    public readonly enabled: boolean;
    private readonly options: Required<CircuitBreakerOptions>;
    private status: CircuitState = 'closed';
    private generation = 0;
    private failures = 0;
    private windowStart = 0;
    private nextProbe = 0;
    private probing = false;

    constructor(options?: CircuitBreakerOptions | false) {
        if (options !== undefined && options !== false && (!options || typeof options !== 'object' || Array.isArray(options))) {
            throw new TypeError('Invalid circuit breaker options');
        }
        this.enabled = options !== undefined && options !== false;
        const { failureThreshold = 3, windowMs = 30000, cooldownMs = 30000 } = options || {};
        this.options = { failureThreshold, windowMs, cooldownMs };
        for (const [name, value] of Object.entries(this.options)) {
            const maximum = name === 'failureThreshold' ? 100 : 3600000;
            if (!Number.isInteger(value) || value < 1 || value > maximum) throw new TypeError(`Invalid circuit breaker ${name}`);
        }
    }

    public get state(): CircuitState { return this.status; }
    public get retryAt(): number { return this.nextProbe; }

    private serverDelay(error: unknown): number | undefined {
        return error instanceof HttpError && [429, 503].includes(error.statusCode) ? error.retryAfterMs : undefined;
    }

    private open(error?: unknown): void {
        this.status = 'open';
        this.nextProbe = Math.max(this.nextProbe, Date.now() + Math.max(this.options.cooldownMs, this.serverDelay(error) ?? 0));
        this.generation++;
    }

    private failure(error: unknown): boolean {
        if (error instanceof HttpError) return error.retryable;
        const code = (error as NodeJS.ErrnoException)?.code;
        return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'].includes(code ?? '');
    }

    public async run<T>(operation: () => Promise<T>): Promise<T> {
        if (!this.enabled) return operation();
        if (this.probing || this.status === 'open' && Date.now() < this.nextProbe) {
            throw new CircuitOpenError(this.nextProbe);
        }
        if (this.status === 'open') {
            this.status = 'half-open';
            this.probing = true;
            this.generation++;
        }
        const probe = this.probing;
        const generation = this.generation;
        try {
            const result = await operation();
            if (generation === this.generation) {
                if (this.status === 'half-open') { this.status = 'closed'; this.generation++; }
                this.failures = 0;
                this.nextProbe = 0;
            }
            return result;
        } catch (error) {
            if (generation === this.generation) {
                if (this.status === 'half-open') this.open(error);
                else if (this.failure(error)) {
                    if (this.serverDelay(error) !== undefined) {
                        this.open(error);
                        throw error;
                    }
                    const now = Date.now();
                    if (!this.failures || now - this.windowStart >= this.options.windowMs) {
                        this.failures = 0;
                        this.windowStart = now;
                    }
                    if (++this.failures >= this.options.failureThreshold) this.open(error);
                }
            } else if (this.status !== 'closed' && this.serverDelay(error) !== undefined) {
                // Concurrent responses may extend an outage, but cannot reopen a recovered circuit.
                this.open(error);
            }
            throw error;
        } finally {
            if (probe) this.probing = false;
        }
    }
}
