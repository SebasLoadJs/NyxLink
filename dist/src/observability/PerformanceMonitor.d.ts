import type { Manager } from '../core/Manager';
declare const metrics: readonly ["rest", "streamOpen", "nodeReady", "playbackStart", "recovery"];
export type PerformanceMetric = typeof metrics[number];
export interface PerformanceMonitorOptions {
    sampleLimit?: number;
    eventLoopResolutionMs?: number;
    maxPendingMs?: number;
}
export interface DurationSummary {
    count: number;
    retained: number;
    p50Ms?: number;
    p95Ms?: number;
    maxMs?: number;
}
export interface PerformanceSnapshot {
    active: boolean;
    durations: Record<PerformanceMetric, DurationSummary>;
    counters: {
        restErrors: number;
        streamOpenErrors: number;
        reconnects: number;
        recoveries: number;
        recoveryFailures: number;
        searches: number;
    };
    runtime: {
        uptimeSeconds: number;
        rssBytes: number;
        heapUsedBytes: number;
        eventLoopUtilization: number;
        eventLoopP50Ms?: number;
        eventLoopP95Ms?: number;
    };
    resources: {
        connectedNodes: number;
        pendingRequests: number;
        pendingPlayerCommands: number;
        managerListeners: number;
        activeTypes: Record<string, number>;
    };
}
export declare class PerformanceMonitor {
    private readonly manager;
    private readonly limit;
    private readonly maxPendingMs;
    private readonly histogram;
    private readonly samples;
    private readonly detach;
    private ready;
    private playback;
    private recovery;
    private utilization;
    private active;
    private closed;
    private pending;
    private readonly counters;
    get running(): boolean;
    constructor(manager: Manager, options?: PerformanceMonitorOptions);
    start(): this;
    private elapsed;
    private finish;
    observe(metric: PerformanceMetric, durationMs: number): void;
    recordSearch(): void;
    measure<T>(metric: 'rest' | 'streamOpen', operation: () => Promise<T>): Promise<T>;
    snapshot(): PerformanceSnapshot;
    close(): void;
}
export {};
