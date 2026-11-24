import type { Manager } from '../core/Manager';
export type BootstrapPhase = 'initializing' | 'initialized' | 'initialization-failed' | 'connecting' | 'ready' | 'partial' | 'timeout' | 'cancelled' | 'no-nodes';
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
export declare class AuroraBootstrap {
    private readonly manager;
    private readonly options;
    private readonly timeout;
    constructor(manager: Manager, options?: BootstrapOptions);
    private publish;
    initialize(clientId: string): Promise<Manager>;
    observeNetwork(): Promise<BootstrapSnapshot>;
}
