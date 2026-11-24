import { performance } from 'node:perf_hooks';
import type { Manager } from '../core/Manager';
import { NodeState } from '../typings/types';

export type BootstrapPhase = 'initializing' | 'initialized' | 'initialization-failed' |
    'connecting' | 'ready' | 'partial' | 'timeout' | 'cancelled' | 'no-nodes';
export interface BootstrapSnapshot {
    phase: BootstrapPhase;
    durationMs: number;
    ready: number;
    total: number;
}
export interface BootstrapOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
    onSnapshot?: (snapshot: BootstrapSnapshot) => void;
}

/** Explicit observer: manager.init retains its existing semantics.
 * Readiness observation is a separate, bounded operation; never starts on import.
 */
export class AuroraBootstrap {
    private readonly timeout: number;
    constructor(private readonly manager: Manager, private readonly options: BootstrapOptions = {}) {
        this.timeout = options.timeoutMs ?? 30000;
        if (!Number.isSafeInteger(this.timeout) || this.timeout < 1 || this.timeout > 300000) {
            throw new RangeError('Invalid bootstrap observation timeout');
        }
    }

    private publish(phase: BootstrapPhase, start: number, ready: number, total: number): BootstrapSnapshot {
        const snapshot = { phase, durationMs: performance.now() - start, ready, total };
        try { this.options.onSnapshot?.({ ...snapshot }); } catch { /* presentation cannot interrupt audio */ }
        return snapshot;
    }

    async initialize(clientId: string): Promise<Manager> {
        const start = performance.now();
        this.publish('initializing', start, 0, 0);
        try {
            const manager = await this.manager.init(clientId);
            this.publish(manager.destroyed ? 'cancelled' : 'initialized', start, 0, 0);
            return manager;
        } catch (error) {
            this.publish('initialization-failed', start, 0, 0);
            throw error;
        }
    }

    observeNetwork(): Promise<BootstrapSnapshot> {
        const start = performance.now();
        const nodes = [...this.manager.nodes.nodes.values()];
        const total = nodes.length;
        const readyCount = () => nodes.filter(node => this.manager.nodes.nodes.get(node.identifier) === node &&
            node.connected && !node.destroyed && node.state === NodeState.READY).length;
        const signal = this.options.signal;
        if (this.manager.destroyed || signal?.aborted) return Promise.resolve(this.publish('cancelled', start, readyCount(), total));
        if (!total) return Promise.resolve(this.publish('no-nodes', start, 0, 0));
        return new Promise(resolve => {
            let finished = false;
            let lastReady = -1;
            const disposers: Array<() => void> = [];
            let timer: ReturnType<typeof setTimeout> | undefined;
            const finish = (phase: BootstrapPhase) => {
                if (finished) return;
                finished = true;
                if (timer) clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                for (const dispose of disposers.splice(0)) dispose();
                resolve(this.publish(phase, start, readyCount(), total));
            };
            const abort = () => finish('cancelled');
            const check = () => {
                if (finished) return;
                if (this.manager.destroyed || signal?.aborted) return finish('cancelled');
                const ready = readyCount();
                if (ready === total) return finish('ready');
                if (ready !== lastReady) {
                    lastReady = ready;
                    this.publish('connecting', start, ready, total);
                }
            };
            disposers.push(
                this.manager.on('nodeReady', check),
                this.manager.on('nodeStateChange', check),
                this.manager.on('nodeDisconnect', check),
                this.manager.on('nodeDestroy', check),
            );
            signal?.addEventListener('abort', abort, { once: true });
            timer = setTimeout(() => finish(this.manager.destroyed || signal?.aborted ? 'cancelled' :
                readyCount() === total ? 'ready' : readyCount() ? 'partial' : 'timeout'), this.timeout);
            check();
        });
    }
}
