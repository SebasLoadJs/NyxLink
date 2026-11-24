"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuroraBootstrap = void 0;
const node_perf_hooks_1 = require("node:perf_hooks");
const types_1 = require("../typings/types");
class AuroraBootstrap {
    manager;
    options;
    timeout;
    constructor(manager, options = {}) {
        this.manager = manager;
        this.options = options;
        this.timeout = options.timeoutMs ?? 30000;
        if (!Number.isSafeInteger(this.timeout) || this.timeout < 1 || this.timeout > 300000) {
            throw new RangeError('Invalid bootstrap observation timeout');
        }
    }
    publish(phase, start, ready, total) {
        const snapshot = { phase, durationMs: node_perf_hooks_1.performance.now() - start, ready, total };
        try {
            this.options.onSnapshot?.({ ...snapshot });
        }
        catch { }
        return snapshot;
    }
    async initialize(clientId) {
        const start = node_perf_hooks_1.performance.now();
        this.publish('initializing', start, 0, 0);
        try {
            const manager = await this.manager.init(clientId);
            this.publish(manager.destroyed ? 'cancelled' : 'initialized', start, 0, 0);
            return manager;
        }
        catch (error) {
            this.publish('initialization-failed', start, 0, 0);
            throw error;
        }
    }
    observeNetwork() {
        const start = node_perf_hooks_1.performance.now();
        const nodes = [...this.manager.nodes.nodes.values()];
        const total = nodes.length;
        const readyCount = () => nodes.filter(node => this.manager.nodes.nodes.get(node.identifier) === node &&
            node.connected && !node.destroyed && node.state === types_1.NodeState.READY).length;
        const signal = this.options.signal;
        if (this.manager.destroyed || signal?.aborted)
            return Promise.resolve(this.publish('cancelled', start, readyCount(), total));
        if (!total)
            return Promise.resolve(this.publish('no-nodes', start, 0, 0));
        return new Promise(resolve => {
            let finished = false;
            let lastReady = -1;
            const disposers = [];
            let timer;
            const finish = (phase) => {
                if (finished)
                    return;
                finished = true;
                if (timer)
                    clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                for (const dispose of disposers.splice(0))
                    dispose();
                resolve(this.publish(phase, start, readyCount(), total));
            };
            const abort = () => finish('cancelled');
            const check = () => {
                if (finished)
                    return;
                if (this.manager.destroyed || signal?.aborted)
                    return finish('cancelled');
                const ready = readyCount();
                if (ready === total)
                    return finish('ready');
                if (ready !== lastReady) {
                    lastReady = ready;
                    this.publish('connecting', start, ready, total);
                }
            };
            disposers.push(this.manager.on('nodeReady', check), this.manager.on('nodeStateChange', check), this.manager.on('nodeDisconnect', check), this.manager.on('nodeDestroy', check));
            signal?.addEventListener('abort', abort, { once: true });
            timer = setTimeout(() => finish(this.manager.destroyed || signal?.aborted ? 'cancelled' :
                readyCount() === total ? 'ready' : readyCount() ? 'partial' : 'timeout'), this.timeout);
            check();
        });
    }
}
exports.AuroraBootstrap = AuroraBootstrap;
//# sourceMappingURL=AuroraBootstrap.js.map