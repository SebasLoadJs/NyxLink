"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitor = void 0;
const node_perf_hooks_1 = require("node:perf_hooks");
const types_1 = require("../typings/types");
const PlaybackGuard_1 = require("../players/PlaybackGuard");
const metrics = ['rest', 'streamOpen', 'nodeReady', 'playbackStart', 'recovery'];
class PerformanceMonitor {
    manager;
    limit;
    maxPendingMs;
    histogram;
    samples = new Map();
    detach = [];
    ready = new WeakMap();
    playback = new WeakMap();
    recovery = new WeakMap();
    utilization = node_perf_hooks_1.performance.eventLoopUtilization();
    active = false;
    closed = false;
    pending = 0;
    counters = { restErrors: 0, streamOpenErrors: 0, reconnects: 0, recoveries: 0, recoveryFailures: 0, searches: 0 };
    get running() { return this.active; }
    constructor(manager, options = {}) {
        this.manager = manager;
        const integer = (value, min, max) => {
            if (!Number.isSafeInteger(value) || value < min || value > max)
                throw new TypeError('Invalid performance monitor options');
            return value;
        };
        this.limit = integer(options.sampleLimit ?? 1024, 1, 10000);
        this.maxPendingMs = integer(options.maxPendingMs ?? 300000, 1000, 3600000);
        this.histogram = (0, node_perf_hooks_1.monitorEventLoopDelay)({ resolution: integer(options.eventLoopResolutionMs ?? 20, 10, 1000) });
        for (const metric of metrics)
            this.samples.set(metric, { values: [], count: 0, cursor: 0 });
    }
    start() {
        if (this.closed || this.manager.destroyed)
            throw new Error('Performance monitor is closed');
        if (this.active)
            return this;
        this.active = true;
        this.histogram.enable();
        this.detach.push(this.manager.on('nodeStateChange', (node, _old, state) => {
            if (state === types_1.NodeState.CONNECTING)
                this.ready.set(node, node_perf_hooks_1.performance.now());
            else if (state === types_1.NodeState.DISCONNECTED || state === types_1.NodeState.DESTROYED)
                this.ready.delete(node);
        }), this.manager.on('nodeReady', node => {
            if (!node.destroyed && node.connected && node.state === types_1.NodeState.READY) {
                this.finish('nodeReady', this.ready, node);
            }
        }), this.manager.on('nodeReconnect', () => { this.counters.reconnects++; }), this.manager.on('playerTriggeredPlay', (player, track) => {
            this.playback.set(player, { time: node_perf_hooks_1.performance.now(), node: player.node, session: player.node.sessionId, ticket: (0, PlaybackGuard_1.playbackGuard)(player).ticket, encoded: track.encoded });
        }), this.manager.on('trackStart', (player, track) => {
            const started = this.playback.get(player);
            if (!started)
                return;
            const stillCurrent = !player.destroyed && player.node === started.node &&
                player.node.sessionId === started.session && (0, PlaybackGuard_1.playbackGuard)(player).isCurrent(started.ticket);
            if (!stillCurrent || node_perf_hooks_1.performance.now() - started.time > this.maxPendingMs) {
                this.playback.delete(player);
                return;
            }
            if (track.encoded !== started.encoded)
                return;
            this.playback.delete(player);
            this.elapsed('playbackStart', started.time);
        }), this.manager.on('playerTriggeredStop', player => this.playback.delete(player)), this.manager.on('playerDestroyed', player => { this.playback.delete(player); this.recovery.delete(player); }), this.manager.on('playerRecoveryStarted', player => {
            if (!player.destroyed && !this.recovery.has(player))
                this.recovery.set(player, node_perf_hooks_1.performance.now());
        }), this.manager.on('playerRecoverySuccess', player => {
            if (!this.recovery.has(player) || player.destroyed)
                return;
            this.finish('recovery', this.recovery, player);
            this.counters.recoveries++;
        }), this.manager.on('playerRecoveryFailed', player => {
            if (!this.recovery.has(player))
                return;
            this.recovery.delete(player);
            this.counters.recoveryFailures++;
        }));
        return this;
    }
    elapsed(metric, started) {
        const duration = node_perf_hooks_1.performance.now() - started;
        if (duration <= this.maxPendingMs)
            this.observe(metric, duration);
    }
    finish(metric, pending, key) {
        const started = pending.get(key);
        pending.delete(key);
        if (started !== undefined)
            this.elapsed(metric, started);
    }
    observe(metric, durationMs) {
        if (!this.active || !Number.isFinite(durationMs) || durationMs < 0)
            return;
        const sample = this.samples.get(metric);
        if (!sample)
            return;
        sample.values[sample.cursor] = durationMs;
        sample.cursor = (sample.cursor + 1) % this.limit;
        sample.count++;
    }
    recordSearch() { if (this.active)
        this.counters.searches++; }
    async measure(metric, operation) {
        if (!this.active)
            return operation();
        const started = node_perf_hooks_1.performance.now();
        this.pending++;
        try {
            return await operation();
        }
        catch (error) {
            if (this.active)
                this.counters[metric === 'rest' ? 'restErrors' : 'streamOpenErrors']++;
            throw error;
        }
        finally {
            this.pending--;
            this.observe(metric, node_perf_hooks_1.performance.now() - started);
        }
    }
    snapshot() {
        const durations = {};
        for (const [metric, sample] of this.samples) {
            const values = [...sample.values].sort((a, b) => a - b);
            durations[metric] = { count: sample.count, retained: values.length, ...(values.length ? {
                    p50Ms: values[Math.ceil(values.length * 0.5) - 1], p95Ms: values[Math.ceil(values.length * 0.95) - 1], maxMs: values[values.length - 1],
                } : {}) };
        }
        const memory = process.memoryUsage();
        const current = node_perf_hooks_1.performance.eventLoopUtilization();
        const utilization = node_perf_hooks_1.performance.eventLoopUtilization(current, this.utilization).utilization;
        this.utilization = current;
        const activeTypes = Object.create(null);
        for (const name of process.getActiveResourcesInfo())
            activeTypes[name] = (activeTypes[name] ?? 0) + 1;
        return { active: this.active, durations, counters: { ...this.counters },
            runtime: { uptimeSeconds: process.uptime(), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed,
                eventLoopUtilization: Number.isFinite(utilization) ? utilization : 0,
                ...(this.histogram.count ? { eventLoopP50Ms: this.histogram.percentile(50) / 1e6, eventLoopP95Ms: this.histogram.percentile(95) / 1e6 } : {}) },
            resources: { connectedNodes: [...this.manager.nodes.nodes.values()].filter(node => node.connected && !node.destroyed).length,
                pendingRequests: this.pending, pendingPlayerCommands: this.manager.players.all.reduce((sum, player) => sum + player.pendingCommands, 0),
                managerListeners: this.manager.listenerCount(), activeTypes },
        };
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.active = false;
        this.histogram.disable();
        this.ready = new WeakMap();
        this.playback = new WeakMap();
        this.recovery = new WeakMap();
        for (const detach of this.detach.splice(0))
            detach();
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
//# sourceMappingURL=PerformanceMonitor.js.map