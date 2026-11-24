import { performance } from 'node:perf_hooks';
import type { Manager } from '../core/Manager';
import type { Logger } from '../logging/Logger';
import { NodeState } from '../typings/types';
import type { PerformanceSnapshot } from './PerformanceMonitor';

export interface TerminalDashboardOptions {
    intervalMs?: number;
    maxNodes?: number;
    maxSources?: number;
    /** Static snapshots remain usable in CI and redirected terminals. */
    mode?: 'auto' | 'static';
}

export interface TerminalDashboardSnapshot {
    performance?: PerformanceSnapshot;
    timestamp: string;
    nodes: Array<{ id: string; backend: string; state: string; players: number; latencyMs?: number; cpuLoad?: number; memoryUsedBytes?: number; statsAgeMs?: number }>;
    audio: { players: number; playing: number; paused: number; queuedTracks: number };
    sources: Array<{ nodeId: string; source: string; status: string; ageMs: number; successRate?: number; p95Ms?: number; circuitBreaker?: string }>;
    runtime: { uptimeSeconds: number; rssBytes: number; heapUsedBytes: number; eventLoopUtilization: number };
    truncatedNodes: number;
    truncatedSources: number;
}

/** Read-only observed snapshots. Construction never starts a timer or writes output. */
export class TerminalDashboard {
    private readonly intervalMs: number;
    private readonly maxNodes: number;
    private readonly maxSources: number;
    private timer?: ReturnType<typeof setInterval>;
    private running = false;
    private previousUtilization = performance.eventLoopUtilization();

    constructor(private readonly manager: Manager, private readonly logger: Logger, private readonly options: TerminalDashboardOptions = {}) {
        const integer = (value: number, min: number, max: number) => {
            if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('Invalid terminal dashboard limit');
            return value;
        };
        this.intervalMs = integer(options.intervalMs ?? 5000, 250, 60000);
        this.maxNodes = integer(options.maxNodes ?? 32, 1, 256);
        this.maxSources = integer(options.maxSources ?? 64, 1, 512);
        if (options.mode !== undefined && options.mode !== 'auto' && options.mode !== 'static') throw new TypeError('Invalid dashboard mode');
    }

    snapshot(): TerminalDashboardSnapshot {
        const now = Date.now();
        const players = this.manager.players.all.filter(player => !player.destroyed);
        const allNodes = [...this.manager.nodes.nodes.values()];
        const nodes: TerminalDashboardSnapshot['nodes'] = [];
        const sources: TerminalDashboardSnapshot['sources'] = [];
        let totalSources = 0;
        const count = new Map<unknown, number>();
        for (const player of players) count.set(player.node, (count.get(player.node) ?? 0) + 1);
        const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
        for (const node of allNodes) {
            if (nodes.length < this.maxNodes) {
                const stats = node.connected && !node.destroyed ? node.stats : undefined;
                nodes.push({ id: node.identifier, backend: node.connected && !node.destroyed ? node.backend?.kind ?? 'unknown' : 'unknown', state: NodeState[node.state]?.toLowerCase() ?? 'unknown', players: count.get(node) ?? 0,
                    ...(node.connected && finite(node.latency) ? { latencyMs: node.latency } : {}),
                    ...(stats && finite(stats.cpu?.systemLoad) ? { cpuLoad: stats.cpu.systemLoad } : {}),
                    ...(stats && finite(stats.memory?.used) ? { memoryUsedBytes: stats.memory.used } : {}),
                    ...(stats && finite(node.statsReceivedAt) ? { statsAgeMs: Math.max(0, now - node.statsReceivedAt) } : {}),
                });
            }
            if (!node.connected || node.destroyed) continue;
            for (const observation of node.sourceHealth.list()) {
                totalSources++;
                if (sources.length >= this.maxSources) continue;
                sources.push({ nodeId: node.identifier, source: observation.source, status: observation.health.status, ageMs: Math.max(0, now - observation.receivedAt),
                    ...(finite(observation.health.successRate) ? { successRate: observation.health.successRate } : {}),
                    ...(finite(observation.health.latency?.p95) ? { p95Ms: observation.health.latency!.p95 } : {}),
                    ...(observation.health.circuitBreaker ? { circuitBreaker: observation.health.circuitBreaker } : {}),
                });
            }
        }
        const memory = process.memoryUsage();
        const current = performance.eventLoopUtilization();
        const utilization = performance.eventLoopUtilization(current, this.previousUtilization).utilization;
        this.previousUtilization = current;
        return { timestamp: new Date(now).toISOString(), nodes, sources,
            ...(this.manager.performanceMonitor ? { performance: this.manager.performanceMonitor.snapshot() } : {}),
            audio: { players: players.length, playing: players.filter(player => player.playing && !player.paused).length,
                paused: players.filter(player => player.paused).length, queuedTracks: players.reduce((total, player) => total + player.queue.size, 0) },
            runtime: { uptimeSeconds: process.uptime(), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, eventLoopUtilization: Number.isFinite(utilization) ? utilization : 0 },
            truncatedNodes: allNodes.length - nodes.length, truncatedSources: totalSources - sources.length,
        };
    }

    render(): TerminalDashboardSnapshot {
        const snapshot = this.snapshot();
        this.logger.event('info', 'Dashboard', 'dashboard.snapshot', snapshot as unknown as Record<string, unknown>,
            `Cluster ${snapshot.nodes.length} nodes | Audio ${snapshot.audio.playing}/${snapshot.audio.players} playing | Sources ${snapshot.sources.length} observed | Heap ${snapshot.runtime.heapUsedBytes} bytes`);
        return snapshot;
    }

    /** No cursor control: ordinary log records and JSON never conflict with redraws. */
    start(): () => void {
        if (this.running || this.manager.destroyed) return () => this.stop();
        this.running = true;
        if (this.logger.isEnabled('info')) this.render();
        if (this.options.mode !== 'static' && process.stdout.isTTY && !process.env.CI) {
            this.timer = setInterval(() => {
                if (this.manager.destroyed || this.logger.getStats().closed) { this.stop(); return; }
                if (this.logger.isEnabled('info')) this.render();
            }, this.intervalMs);
            this.timer.unref();
        }
        return () => this.stop();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
        this.running = false;
    }
}
