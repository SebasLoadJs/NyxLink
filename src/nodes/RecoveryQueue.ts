/** Admission is bounded per manager; individual players still share their pending recovery. */
export class RecoveryQueue<T> {
    private active = 0;
    private readonly waiting: Array<() => void> = [];

    constructor(private readonly concurrency = 4, private readonly maxWaiting = 1000) {
        if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100 ||
            !Number.isInteger(maxWaiting) || maxWaiting < 0 || maxWaiting > 10000) {
            throw new TypeError('Recovery requires concurrency 1..100 and queue limit 0..10000');
        }
    }

    public run(operation: () => Promise<T>, overflow: () => T): Promise<T> {
        return new Promise((resolve, reject) => {
            const start = () => {
                this.active++;
                void Promise.resolve().then(operation).then(resolve, reject).finally(() => {
                    this.active--;
                    this.waiting.shift()?.();
                });
            };
            if (this.active < this.concurrency) start();
            else if (this.waiting.length >= this.maxWaiting) resolve(overflow());
            else this.waiting.push(start);
        });
    }
}
