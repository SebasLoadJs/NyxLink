import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { Manager } from '../core/Manager';
import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';
import { NodeState } from '../typings/types';
import { playbackGuard } from '../players/PlaybackGuard';

const metrics = ['rest', 'streamOpen', 'nodeReady', 'playbackStart', 'recovery'] as const;
export type PerformanceMetric = typeof metrics[number];
export interface PerformanceMonitorOptions { sampleLimit?: number; eventLoopResolutionMs?: number; maxPendingMs?: number }
export interface DurationSummary { count: number; retained: number; p50Ms?: number; p95Ms?: number; maxMs?: number }
export interface PerformanceSnapshot {
    active: boolean;
    durations: Record<PerformanceMetric, DurationSummary>;
    counters: { restErrors: number; streamOpenErrors: number; reconnects: number; recoveries: number; recoveryFailures: number; searches: number };
    runtime: { uptimeSeconds: number; rssBytes: number; heapUsedBytes: number; eventLoopUtilization: number; eventLoopP50Ms?: number; eventLoopP95Ms?: number };
    resources: { connectedNodes: number; pendingRequests: number; pendingPlayerCommands: number; managerListeners: number; activeTypes: Record<string, number> };
}

/** Opt-in, bounded process/operation observations; never stores guild/track IDs in output. */
export class PerformanceMonitor {
    private readonly limit: number;
    private readonly maxPendingMs: number;
    private readonly histogram: ReturnType<typeof monitorEventLoopDelay>;
    private readonly samples = new Map<PerformanceMetric, { values: number[]; count: number; cursor: number }>();
    private readonly detach: Array<() => void> = [];
    private ready = new WeakMap<Node, number>();
    private playback = new WeakMap<Player, { time: number; node: Node; session: string; ticket: number; encoded: string }>();
    private recovery = new WeakMap<Player, number>();
    private utilization = performance.eventLoopUtilization();
    private active = false;
    private closed = false;
    private pending = 0;
    private readonly counters = { restErrors: 0, streamOpenErrors: 0, reconnects: 0, recoveries: 0, recoveryFailures: 0, searches: 0 };
    public get running(): boolean { return this.active; }

    constructor(private readonly manager: Manager, options: PerformanceMonitorOptions = {}) {
        const integer = (value: number, min: number, max: number) => {
            if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('Invalid performance monitor options');
            return value;
        };
        this.limit = integer(options.sampleLimit ?? 1024, 1, 10000);
        this.maxPendingMs = integer(options.maxPendingMs ?? 300000, 1000, 3600000);
        this.histogram = monitorEventLoopDelay({ resolution: integer(options.eventLoopResolutionMs ?? 20, 10, 1000) });
        for (const metric of metrics) this.samples.set(metric, { values: [], count: 0, cursor: 0 });
    }

    start(): this {
        if (this.closed || this.manager.destroyed) throw new Error('Performance monitor is closed');
        if (this.active) return this;
        this.active = true;
        this.histogram.enable();
        this.detach.push(
            this.manager.on('nodeStateChange', (node, _old, state) => {
                if (state === NodeState.CONNECTING) this.ready.set(node, performance.now());
                else if (state === NodeState.DISCONNECTED || state === NodeState.DESTROYED) this.ready.delete(node);
            }),
            this.manager.on('nodeReady', node => {
                if (!node.destroyed && node.connected && node.state === NodeState.READY) {
                    this.finish('nodeReady', this.ready, node);
                }
            }),
            this.manager.on('nodeReconnect', () => { this.counters.reconnects++; }),
            this.manager.on('playerTriggeredPlay', (player, track) => {
                this.playback.set(player, { time: performance.now(), node: player.node, session: player.node.sessionId, ticket: playbackGuard(player).ticket, encoded: track.encoded });
            }),
            this.manager.on('trackStart', (player, track) => {
                const started = this.playback.get(player);
                if (!started) return;
                const stillCurrent = !player.destroyed && player.node === started.node &&
                    player.node.sessionId === started.session && playbackGuard(player).isCurrent(started.ticket);
                if (!stillCurrent || performance.now() - started.time > this.maxPendingMs) {
                    this.playback.delete(player);
                    return;
                }
                // A delayed TrackStart from the previous song is not an
                // acknowledgement of the newest playback intent.
                if (track.encoded !== started.encoded) return;
                this.playback.delete(player);
                this.elapsed('playbackStart', started.time);
            }),
            this.manager.on('playerTriggeredStop', player => this.playback.delete(player)),
            this.manager.on('playerDestroyed', player => { this.playback.delete(player); this.recovery.delete(player); }),
            this.manager.on('playerRecoveryStarted', player => {
                if (!player.destroyed && !this.recovery.has(player)) this.recovery.set(player, performance.now());
            }),
            this.manager.on('playerRecoverySuccess', player => {
                if (!this.recovery.has(player) || player.destroyed) return;
                this.finish('recovery', this.recovery, player);
                this.counters.recoveries++;
            }),
            this.manager.on('playerRecoveryFailed', player => {
                if (!this.recovery.has(player)) return;
                this.recovery.delete(player);
                this.counters.recoveryFailures++;
            }),
        );
        return this;
    }

    private elapsed(metric: PerformanceMetric, started: number): void {
        const duration = performance.now() - started;
        if (duration <= this.maxPendingMs) this.observe(metric, duration);
    }
    private finish<T extends object>(metric: PerformanceMetric, pending: WeakMap<T, number>, key: T): void {
        const started = pending.get(key);
        pending.delete(key);
        if (started !== undefined) this.elapsed(metric, started);
    }
    observe(metric: PerformanceMetric, durationMs: number): void {
        if (!this.active || !Number.isFinite(durationMs) || durationMs < 0) return;
        const sample = this.samples.get(metric);
        if (!sample) return;
        sample.values[sample.cursor] = durationMs;
        sample.cursor = (sample.cursor + 1) % this.limit;
        sample.count++;
    }
    recordSearch(): void { if (this.active) this.counters.searches++; }

    async measure<T>(metric: 'rest' | 'streamOpen', operation: () => Promise<T>): Promise<T> {
        if (!this.active) return operation();
        const started = performance.now();
        this.pending++;
        try { return await operation(); }
        catch (error) {
            if (this.active) this.counters[metric === 'rest' ? 'restErrors' : 'streamOpenErrors']++;
            throw error;
        } finally { this.pending--; this.observe(metric, performance.now() - started); }
    }

    snapshot(): PerformanceSnapshot {
        const durations = {} as Record<PerformanceMetric, DurationSummary>;
        for (const [metric, sample] of this.samples) {
            const values = [...sample.values].sort((a, b) => a - b);
            durations[metric] = { count: sample.count, retained: values.length, ...(values.length ? {
                p50Ms: values[Math.ceil(values.length * 0.5) - 1], p95Ms: values[Math.ceil(values.length * 0.95) - 1], maxMs: values[values.length - 1],
            } : {}) };
        }
        const memory = process.memoryUsage();
        const current = performance.eventLoopUtilization();
        const utilization = performance.eventLoopUtilization(current, this.utilization).utilization;
        this.utilization = current;
        const activeTypes: Record<string, number> = Object.create(null);
        for (const name of process.getActiveResourcesInfo()) activeTypes[name] = (activeTypes[name] ?? 0) + 1;
        return { active: this.active, durations, counters: { ...this.counters },
            runtime: { uptimeSeconds: process.uptime(), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed,
                eventLoopUtilization: Number.isFinite(utilization) ? utilization : 0,
                ...(this.histogram.count ? { eventLoopP50Ms: this.histogram.percentile(50) / 1e6, eventLoopP95Ms: this.histogram.percentile(95) / 1e6 } : {}) },
            resources: { connectedNodes: [...this.manager.nodes.nodes.values()].filter(node => node.connected && !node.destroyed).length,
                pendingRequests: this.pending, pendingPlayerCommands: this.manager.players.all.reduce((sum, player) => sum + player.pendingCommands, 0),
                managerListeners: this.manager.listenerCount(), activeTypes },
        };
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.active = false;
        this.histogram.disable();
        this.ready = new WeakMap();
        this.playback = new WeakMap();
        this.recovery = new WeakMap();
        for (const detach of this.detach.splice(0)) detach();
    }
}
