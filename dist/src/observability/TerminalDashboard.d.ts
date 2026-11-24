import type { Manager } from '../core/Manager';
import type { PerformanceSnapshot } from './PerformanceMonitor';
export interface TerminalDashboardOptions {
    intervalMs?: number;
    maxNodes?: number;
    maxSources?: number;
    mode?: 'auto' | 'static';
}
export interface TerminalDashboardSnapshot {
    performance?: PerformanceSnapshot;
    timestamp: string;
    nodes: Array<{
        id: string;
        backend: string;
        state: string;
        players: number;
        latencyMs?: number;
        cpuLoad?: number;
        memoryUsedBytes?: number;
        statsAgeMs?: number;
    }>;
    audio: {
        players: number;
        playing: number;
        paused: number;
        queuedTracks: number;
    };
    sources: Array<{
        nodeId: string;
        source: string;
        status: string;
        ageMs: number;
        successRate?: number;
        p95Ms?: number;
        circuitBreaker?: string;
    }>;
    runtime: {
        uptimeSeconds: number;
        rssBytes: number;
        heapUsedBytes: number;
        eventLoopUtilization: number;
    };
    truncatedNodes: number;
    truncatedSources: number;
}
export declare class TerminalDashboard {
    private readonly manager;
    private readonly options;
    private readonly intervalMs;
    private readonly maxNodes;
    private readonly maxSources;
    private timer?;
    private running;
    private previousUtilization;
    constructor(manager: Manager, options?: TerminalDashboardOptions);
    snapshot(): TerminalDashboardSnapshot;
    render(): TerminalDashboardSnapshot;
    start(): () => void;
    stop(): void;
}
