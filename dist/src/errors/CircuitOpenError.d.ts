export declare class CircuitOpenError extends Error {
    readonly retryAt: number;
    readonly code = "CIRCUIT_OPEN";
    constructor(retryAt: number);
}
