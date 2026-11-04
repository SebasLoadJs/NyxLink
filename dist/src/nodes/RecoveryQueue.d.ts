export declare class RecoveryQueue<T> {
    private readonly concurrency;
    private readonly maxWaiting;
    private active;
    private readonly waiting;
    constructor(concurrency?: number, maxWaiting?: number);
    run(operation: () => Promise<T>, overflow: () => T): Promise<T>;
}
