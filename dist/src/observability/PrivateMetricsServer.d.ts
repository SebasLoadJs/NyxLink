import type { Manager } from '../core/Manager';
export interface PrivateMetricsOptions {
    token: string;
    host?: '127.0.0.1' | '::1';
    port?: number;
}
export interface PrivateMetricsSnapshot {
    healthy: boolean;
    nodes: {
        total: number;
        ready: number;
        draining: number;
    };
    players: {
        total: number;
        playing: number;
        paused: number;
    };
}
export interface PrivateMetricsNode {
    key: string;
    backend: string;
    state: string;
    ready: boolean;
    draining: boolean;
    players: number;
    playingPlayers: number;
}
export declare class PrivateMetricsServer {
    private readonly manager;
    private readonly expectedToken;
    private readonly bindHost;
    private readonly bindPort;
    private readonly server;
    private listenPromise?;
    private closed;
    constructor(manager: Manager, options: PrivateMetricsOptions);
    get url(): string;
    listen(): Promise<this>;
    close(): Promise<void>;
    snapshot(): PrivateMetricsSnapshot;
    private nodeKey;
    private nodeEntries;
    private authorized;
    private send;
    private handle;
}
