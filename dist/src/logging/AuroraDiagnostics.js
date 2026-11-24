"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuroraCapabilityExplorer = exports.AuroraIncidentEngine = exports.AuroraMusicStrip = void 0;
const node_perf_hooks_1 = require("node:perf_hooks");
const AuroraEvents_1 = require("./AuroraEvents");
const types_1 = require("../typings/types");
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const backend = (value) => value === 'lavalink' || value === 'nodelink' ? value : 'unknown';
class AuroraMusicStrip {
    player;
    now;
    disposers = [];
    anchor;
    ended = false;
    closed = false;
    constructor(player, now = () => node_perf_hooks_1.performance.now()) {
        this.player = player;
        this.now = now;
        const manager = player.manager;
        this.disposers.push(manager.on('playerUpdate', (owner, track, payload) => {
            if (owner !== player || !track || track !== player.current)
                return;
            const position = finite(payload?.state?.position);
            if (position !== undefined && payload?.state?.connected === true && player.playing && !player.paused)
                this.anchor = { track, position, at: this.now() };
            else
                this.anchor = undefined;
        }), manager.on('trackStart', (owner, track) => {
            if (owner !== player)
                return;
            this.ended = false;
            this.anchor = undefined;
            const position = finite(track.getInfo().position);
            if (position !== undefined)
                this.anchor = { track, position, at: this.now() };
        }), manager.on('trackEnd', (owner, track, reason) => {
            if (owner !== player || (player.current && player.current !== track) ||
                reason === 'gapless' || reason === 'crossfading' || reason === 'replaced')
                return;
            this.ended = true;
            this.anchor = undefined;
        }), manager.on('playerPause', owner => { if (owner === player)
            this.anchor = undefined; }), manager.on('playerSeek', owner => { if (owner === player)
            this.anchor = undefined; }), manager.on('playerStop', owner => { if (owner === player) {
            this.ended = true;
            this.anchor = undefined;
        } }), manager.on('playerSwitchedNode', owner => { if (owner === player)
            this.anchor = undefined; }), manager.on('playerDestroy', owner => { if (owner === player)
            this.close(); }));
    }
    snapshot() {
        const player = this.player;
        const track = player.current;
        const info = track?.getInfo();
        const state = this.closed || player.destroyed || this.ended ? 'ended' :
            !track ? 'idle' : !player.connected || !player.node.connected ? 'unknown' :
                player.paused ? 'paused' : player.playing ? 'playing' : 'idle';
        const stream = info?.isStream === true;
        const duration = !stream ? finite(info?.length) : undefined;
        let position = state === 'ended' || state === 'idle' ? undefined : finite(info?.position);
        let estimated = false;
        if (state === 'playing' && track && this.anchor?.track === track) {
            const elapsed = Math.max(0, this.now() - this.anchor.at);
            if (elapsed <= 5000) {
                position = this.anchor.position + elapsed;
                estimated = elapsed > 0;
            }
        }
        if (position !== undefined && duration !== undefined && duration > 0)
            position = Math.min(position, duration);
        return { state, stream, estimated, crossfadeConfigured: player.getCrossfade()?.enabled === true,
            ...(position === undefined ? {} : { positionMs: position }),
            ...(duration && duration > 0 ? { durationMs: duration } : {}) };
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        for (const dispose of this.disposers.splice(0)) {
            try {
                dispose();
            }
            catch { }
        }
        this.anchor = undefined;
    }
}
exports.AuroraMusicStrip = AuroraMusicStrip;
const incidentStates = new Map([
    ['FAILOVER_STARTED', 'recovering'], ['FAILOVER_RECOVERED', 'recovered'],
    ['FAILOVER_FAILED', 'failed'], ['FAILOVER_CANCELLED', 'cancelled'],
]);
class AuroraIncidentEngine {
    capacity;
    incidents = new Map();
    constructor(capacity = 100) {
        this.capacity = capacity;
        if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10000)
            throw new RangeError('Invalid incident capacity');
    }
    accept(event) {
        const reasonCode = (0, AuroraEvents_1.safeFailoverReason)(event.sanitizedContext?.reasonCode);
        const state = event.eventCode === 'FAILOVER_RECOVERED' && reasonCode === 'source-cleanup-failed' ? 'degraded' : incidentStates.get(event.eventCode);
        const id = event.operationId;
        if (!state || typeof id !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))
            return;
        const prior = this.incidents.get(id);
        if (prior && (prior.state !== 'recovering' || state === 'recovering'))
            return;
        const duration = state !== 'recovering' ? finite(event.durationMs) : undefined;
        const result = { operationId: id, state, backend: backend(event.sanitizedContext?.backend),
            ...(prior?.state === 'recovering' && state !== 'recovering' ? { sourceBackend: prior.backend } : {}),
            ...(reasonCode ? { reasonCode } : {}),
            ...(duration === undefined ? {} : { durationMs: duration }) };
        this.incidents.delete(id);
        this.incidents.set(id, result);
        if (this.incidents.size > this.capacity)
            this.incidents.delete(this.incidents.keys().next().value);
        return { ...result };
    }
    snapshot() { return [...this.incidents.values()].map(value => ({ ...value })); }
}
exports.AuroraIncidentEngine = AuroraIncidentEngine;
class AuroraCapabilityExplorer {
    manager;
    aliases = new WeakMap();
    nextAlias = 0;
    constructor(manager) {
        this.manager = manager;
    }
    snapshot() {
        return [...this.manager.nodes.nodes.values()].map(node => {
            let alias = this.aliases.get(node);
            if (!alias) {
                alias = 'NODE-' + String(++this.nextAlias).padStart(2, '0');
                this.aliases.set(node, alias);
            }
            const available = node.connected && !node.destroyed;
            const ready = available && node.state === types_1.NodeState.READY;
            const latency = available ? finite(node.latency) : undefined;
            const memory = available ? finite(node.stats?.memory?.used) : undefined;
            const capabilities = available ? (node.backend?.listFeatures() ?? []).filter(feature => /^[a-z][a-z0-9:_-]{0,63}$/.test(feature.feature)).map(feature => ({
                feature: feature.feature, state: feature.state, evidence: feature.evidence,
            })) : [];
            return { alias, backend: backend(available ? node.backend?.kind : undefined), ready, draining: node.draining,
                ...(latency === undefined ? {} : { latencyMs: latency }),
                ...(memory === undefined ? {} : { memoryUsedBytes: memory }), capabilities };
        });
    }
}
exports.AuroraCapabilityExplorer = AuroraCapabilityExplorer;
//# sourceMappingURL=AuroraDiagnostics.js.map