export class CircuitOpenError extends Error {
    public readonly code = 'CIRCUIT_OPEN';

    constructor(public readonly retryAt: number) {
        super('Node circuit is open; wait for the recovery probe');
        this.name = 'CircuitOpenError';
    }
}
