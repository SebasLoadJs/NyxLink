export declare class PlayerCommandQueue {
    private tail;
    private count;
    get pending(): number;
    enqueue<T>(operation: () => Promise<T>): Promise<T>;
}
