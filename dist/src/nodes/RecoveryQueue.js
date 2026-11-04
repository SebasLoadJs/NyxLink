"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecoveryQueue = void 0;
class RecoveryQueue {
    concurrency;
    maxWaiting;
    active = 0;
    waiting = [];
    constructor(concurrency = 4, maxWaiting = 1000) {
        this.concurrency = concurrency;
        this.maxWaiting = maxWaiting;
        if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100 ||
            !Number.isInteger(maxWaiting) || maxWaiting < 0 || maxWaiting > 10000) {
            throw new TypeError('Recovery requires concurrency 1..100 and queue limit 0..10000');
        }
    }
    run(operation, overflow) {
        return new Promise((resolve, reject) => {
            const start = () => {
                this.active++;
                void Promise.resolve().then(operation).then(resolve, reject).finally(() => {
                    this.active--;
                    this.waiting.shift()?.();
                });
            };
            if (this.active < this.concurrency)
                start();
            else if (this.waiting.length >= this.maxWaiting)
                resolve(overflow());
            else
                this.waiting.push(start);
        });
    }
}
exports.RecoveryQueue = RecoveryQueue;
//# sourceMappingURL=RecoveryQueue.js.map