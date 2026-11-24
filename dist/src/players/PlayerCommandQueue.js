"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerCommandQueue = void 0;
class PlayerCommandQueue {
    tail = Promise.resolve();
    count = 0;
    get pending() { return this.count; }
    enqueue(operation) {
        this.count++;
        const result = this.tail.then(operation).finally(() => { this.count--; });
        this.tail = result.then(() => undefined, () => undefined);
        return result;
    }
}
exports.PlayerCommandQueue = PlayerCommandQueue;
//# sourceMappingURL=PlayerCommandQueue.js.map