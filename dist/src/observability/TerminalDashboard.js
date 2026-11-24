"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalDashboard = void 0;
const node_perf_hooks_1 = require("node:perf_hooks");
const ManagerLogRoute_1 = require("../logging/ManagerLogRoute");
const types_1 = require("../typings/types");
class TerminalDashboard {
    manager;
    options;
    intervalMs;
    maxNodes;
    maxSources;
    timer;
    running = false;
    previousUtilization = node_perf_hooks_1.performance.eventLoopUtilization();
    constructor(manager, options = {}) {
        this.manager = manager;
        this.options = options;
        const integer = (value, min, max) => {
            if (!Number.isSafeInteger(value) || value < min || value > max)
                throw new TypeError('Invalid terminal dashboard limit');
            return value;
        };
        this.intervalMs = integer(options.intervalMs ?? 5000, 250, 60000);
        this.maxNodes = integer(options.maxNodes ?? 32, 1, 256);
        this.maxSources = integer(options.maxSources ?? 64, 1, 512);
        if (options.mode !== undefined && options.mode !== 'auto' && options.mode !== 'static')
            throw new TypeError('Invalid dashboard mode');
    }
    snapshot() {
        const now = Date.now();
        const players = this.manager.players.all.filter(player => !player.destroyed);
        const allNodes = [...this.manager.nodes.nodes.values()];
        const nodes = [];
        const sources = [];
        let totalSources = 0;
        const count = new Map();
        for (const player of players)
            count.set(player.node, (count.get(player.node) ?? 0) + 1);
        const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
        for (const node of allNodes) {
            if (nodes.length < this.maxNodes) {
                const stats = node.connected && !node.destroyed ? node.stats : undefined;
                nodes.push({ id: node.identifier, backend: node.connected && !node.destroyed ? node.backend?.kind ?? 'unknown' : 'unknown', state: types_1.NodeState[node.state]?.toLowerCase() ?? 'unknown', players: count.get(node) ?? 0,
                    ...(node.connected && finite(node.latency) ? { latencyMs: node.latency } : {}),
                    ...(stats && finite(stats.cpu?.systemLoad) ? { cpuLoad: stats.cpu.systemLoad } : {}),
                    ...(stats && finite(stats.memory?.used) ? { memoryUsedBytes: stats.memory.used } : {}),
                    ...(stats && finite(node.statsReceivedAt) ? { statsAgeMs: Math.max(0, now - node.statsReceivedAt) } : {}),
                });
            }
            if (!node.connected || node.destroyed)
                continue;
            for (const observation of node.sourceHealth.list()) {
                totalSources++;
                if (sources.length >= this.maxSources)
                    continue;
                sources.push({ nodeId: node.identifier, source: observation.source, status: observation.health.status, ageMs: Math.max(0, now - observation.receivedAt),
                    ...(finite(observation.health.successRate) ? { successRate: observation.health.successRate } : {}),
                    ...(finite(observation.health.latency?.p95) ? { p95Ms: observation.health.latency.p95 } : {}),
                    ...(observation.health.circuitBreaker ? { circuitBreaker: observation.health.circuitBreaker } : {}), });
            }
        }
        const memory = process.memoryUsage();
        const current = node_perf_hooks_1.performance.eventLoopUtilization();
        const utilization = node_perf_hooks_1.performance.eventLoopUtilization(current, this.previousUtilization).utilization;
        this.previousUtilization = current;
        return { timestamp: new Date(now).toISOString(), nodes, sources,
            ...(this.manager.performanceMonitor ? { performance: this.manager.performanceMonitor.snapshot() } : {}),
            audio: { players: players.length, playing: players.filter(player => player.playing && !player.paused).length,
                paused: players.filter(player => player.paused).length, queuedTracks: players.reduce((total, player) => total + player.queue.size, 0) },
            runtime: { uptimeSeconds: process.uptime(), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, eventLoopUtilization: Number.isFinite(utilization) ? utilization : 0 },
            truncatedNodes: allNodes.length - nodes.length, truncatedSources: totalSources - sources.length,
        };
    }
    render() {
        const snapshot = this.snapshot();
        (0, ManagerLogRoute_1.getManagerLogRoute)(this.manager)?.recordDashboard({ nodeCount: snapshot.nodes.length + snapshot.truncatedNodes,
            playerCount: snapshot.audio.players, playingCount: snapshot.audio.playing, queuedTracks: snapshot.audio.queuedTracks,
            sourceCount: snapshot.sources.length + snapshot.truncatedSources });
        return snapshot;
    }
    start() {
        if (this.running || this.manager.destroyed)
            return () => this.stop();
        this.running = true;
        if (!(0, ManagerLogRoute_1.getManagerLogRoute)(this.manager)) {
            this.running = false;
            return () => this.stop();
        }
        this.render();
        if (this.options.mode !== 'static' && process.stdout.isTTY && !process.env.CI) {
            this.timer = setInterval(() => {
                if (this.manager.destroyed || !(0, ManagerLogRoute_1.getManagerLogRoute)(this.manager)) {
                    this.stop();
                    return;
                }
                this.render();
            }, this.intervalMs);
            this.timer.unref();
        }
        return () => this.stop();
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = undefined;
        this.running = false;
    }
}
exports.TerminalDashboard = TerminalDashboard;
//# sourceMappingURL=TerminalDashboard.js.map