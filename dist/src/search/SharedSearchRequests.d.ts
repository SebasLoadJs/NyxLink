export declare class SharedSearchRequests<T> {
    private readonly entries;
    private closed;
    run(key: string, signal: AbortSignal, load: (signal: AbortSignal) => Promise<T>): Promise<T>;
    close(): void;
}
