export type CircuitBreakerOptions = {
    failureThreshold?: number;
    windowMs?: number;
    cooldownMs?: number;
};
export type CircuitState = 'closed' | 'open' | 'half-open';
export declare class NodeCircuitBreaker {
    readonly enabled: boolean;
    private readonly options;
    private status;
    private generation;
    private failures;
    private windowStart;
    private nextProbe;
    constructor(options?: CircuitBreakerOptions | false);
    get state(): CircuitState;
    get retryAt(): number;
    private open;
    private failure;
    run<T>(operation: () => Promise<T>): Promise<T>;
}
