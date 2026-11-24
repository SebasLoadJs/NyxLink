/** A rejected operation is reported to its caller without blocking later commands. */
export class PlayerCommandQueue {
    private tail: Promise<void> = Promise.resolve();
    private count = 0;
    public get pending(): number { return this.count; }

    public enqueue<T>(operation: () => Promise<T>): Promise<T> {
        this.count++;
        const result = this.tail.then(operation).finally(() => { this.count--; });
        this.tail = result.then(() => undefined, () => undefined);
        return result;
    }
}
