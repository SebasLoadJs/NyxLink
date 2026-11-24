"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuroraInspectorStore = void 0;
const ObservedFields_1 = require("./ObservedFields");
const AuroraDiagnostics_1 = require("./AuroraDiagnostics");
const AuroraEvents_1 = require("./AuroraEvents");
const backend = (value) => value === 'nodelink' || value === 'lavalink' ? value : 'unknown';
const hex = (value, size) => typeof value === 'string' && value.length === size && /^[a-f0-9]+$/.test(value) && !/^0+$/.test(value);
const duration = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const spanNames = new Set(['nyxlink.search', 'nyxlink.rest', 'nyxlink.connect', 'nyxlink.handshake', 'nyxlink.reconnect',
    'nyxlink.failover', 'nyxlink.player.play', 'nyxlink.player.seek', 'nyxlink.player.stop',
    'nyxlink.resolve', 'nyxlink.capabilities', 'nyxlink.node.select', 'nyxlink.session.restore', 'nyxlink.autoplay', 'nyxlink.crossfade']);
function append(items, value, limit) {
    items.push(value);
    if (items.length > limit)
        items.shift();
}
class AuroraInspectorStore {
    manager;
    capacity;
    explorer;
    events = [];
    spans = [];
    players = new WeakMap();
    latency = new Map();
    historyLimit = 60;
    nextPlayer = 0;
    constructor(manager, capacity = 200) {
        this.manager = manager;
        this.capacity = capacity;
        if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10000)
            throw new RangeError('Invalid inspector capacity');
        this.explorer = new AuroraDiagnostics_1.AuroraCapabilityExplorer(manager);
    }
    recordEvent(input) {
        if (!input || typeof input !== 'object')
            return false;
        const record = (0, ObservedFields_1.observedFields)(input, ['eventCode', 'sanitizedContext', 'timestamp', 'durationMs', 'traceId', 'spanId']);
        const code = record.eventCode;
        if (typeof code !== 'string' || !Object.hasOwn(AuroraEvents_1.auroraCatalog, code))
            return false;
        const definition = AuroraEvents_1.auroraCatalog[code];
        const context = (0, ObservedFields_1.observedFields)(record.sanitizedContext, ['backend']);
        const event = { code: code, category: definition.category,
            level: definition.level, message: definition.message, backend: backend(context?.backend) };
        if (typeof record.timestamp === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.timestamp))
            event.timestamp = record.timestamp;
        if (duration(record.durationMs))
            event.durationMs = record.durationMs;
        if (hex(record.traceId, 32) && hex(record.spanId, 16)) {
            event.traceId = record.traceId;
            event.spanId = record.spanId;
        }
        append(this.events, event, this.capacity);
        return true;
    }
    recordSpan(input) {
        if (!input || typeof input !== 'object')
            return false;
        const span = (0, ObservedFields_1.observedFields)(input, ['name', 'traceId', 'spanId', 'parentSpanId', 'durationMs', 'startTimeMs', 'outcome']);
        if (typeof span.name !== 'string' || !spanNames.has(span.name) ||
            !hex(span.traceId, 32) || !hex(span.spanId, 16) || !duration(span.durationMs) ||
            (span.outcome !== 'ok' && span.outcome !== 'error' && span.outcome !== 'unset'))
            return false;
        const value = { name: span.name, traceId: span.traceId, spanId: span.spanId,
            durationMs: span.durationMs, outcome: span.outcome };
        if (duration(span.startTimeMs))
            value.startTimeMs = span.startTimeMs;
        if (this.spans.some(x => x.traceId === value.traceId && x.spanId === value.spanId))
            return false;
        if (hex(span.parentSpanId, 16) && span.parentSpanId !== span.spanId)
            value.parentSpanId = span.parentSpanId;
        append(this.spans, value, this.capacity);
        return true;
    }
    sampleLatencies(now = Date.now()) {
        if (!duration(now))
            return;
        const nodes = this.explorer.snapshot();
        const aliases = new Set(nodes.map(node => node.alias));
        for (const alias of this.latency.keys())
            if (!aliases.has(alias))
                this.latency.delete(alias);
        for (const node of nodes.slice(0, this.capacity)) {
            if (!duration(node.latencyMs))
                continue;
            const series = this.latency.get(node.alias) ?? [];
            if (series.length && now <= series.at(-1).timeMs)
                continue;
            append(series, { timeMs: now, latencyMs: node.latencyMs }, this.historyLimit);
            this.latency.set(node.alias, series);
            if (this.latency.size > this.capacity)
                this.latency.delete(this.latency.keys().next().value);
        }
    }
    latencyHistory(alias) {
        return (this.latency.get(alias) ?? []).map(sample => ({ ...sample }));
    }
    snapshot() {
        const players = [];
        for (const player of this.manager.players.all) {
            if (player.destroyed)
                continue;
            let alias = this.players.get(player);
            if (!alias) {
                alias = 'PLAYER-' + String(++this.nextPlayer).padStart(2, '0');
                this.players.set(player, alias);
            }
            const state = !player.connected ? 'unknown' : player.paused ? 'paused' : player.playing ? 'playing' : 'idle';
            players.push({ alias, state, backend: backend(player.node.backend?.kind) });
        }
        return { source: 'live', nodes: this.explorer.snapshot(), players,
            events: this.events.map(x => ({ ...x })), spans: this.spans.map(x => ({ ...x })) };
    }
}
exports.AuroraInspectorStore = AuroraInspectorStore;
//# sourceMappingURL=AuroraInspector.js.map