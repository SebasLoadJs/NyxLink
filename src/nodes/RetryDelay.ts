export function retryJitter(value: unknown = 0): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new TypeError('retryJitter must be a number between 0 and 1');
    }
    return value;
}

/** Jitter is applied after the cap and never increases the configured retry budget. */
export function retryDelay(baseMs: number, attempt: number, jitter: number, maximumMs: number): number {
    const delay = Math.min(Math.max(0, baseMs) * Math.pow(2, attempt), maximumMs);
    return jitter === 0 ? delay : Math.floor(delay * (1 - jitter + jitter * Math.random()));
}
