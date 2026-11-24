import type { Manager } from '../core/Manager';
import type { Player } from '../entities/Player';
import { AuroraCapabilityExplorer, type CapabilityNode } from './AuroraDiagnostics';
import { auroraCatalog, type AuroraEventCode, type AuroraCategory, type AuroraLevel } from './AuroraEvents';

export interface InspectorEvent {
    code: AuroraEventCode;
    category: AuroraCategory;
    level: AuroraLevel;
    message: string;
    timestamp?: string;
    durationMs?: number;
    backend: 'lavalink' | 'nodelink' | 'unknown';
    traceId?: string;
    spanId?: string;
}
export interface InspectorSpan {
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    durationMs: number;
    outcome: 'ok' | 'error' | 'unset';
}
export interface InspectorPlayer {
    alias: string;
    state: 'playing' | 'paused' | 'idle' | 'unknown';
    backend: 'lavalink' | 'nodelink' | 'unknown';
}
export interface InspectorSnapshot {
    source: 'live' | 'simulated';
    nodes: CapabilityNode[];
    players: InspectorPlayer[];
    events: InspectorEvent[];
    spans: InspectorSpan[];
}
const backend = (value: unknown): InspectorPlayer['backend'] =>
    value === 'nodelink' || value === 'lavalink' ? value : 'unknown';
const hex = (value: unknown, size: number): value is string =>
    typeof value === 'string' && value.length === size && /^[a-f0-9]+$/.test(value) && !/^0+$/.test(value);
const duration = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const spanNames = new Set(['nyxlink.search', 'nyxlink.rest', 'nyxlink.connect', 'nyxlink.handshake', 'nyxlink.reconnect',
    'nyxlink.failover', 'nyxlink.player.play', 'nyxlink.player.seek', 'nyxlink.player.stop',
    'nyxlink.resolve', 'nyxlink.capabilities', 'nyxlink.node.select', 'nyxlink.session.restore', 'nyxlink.autoplay', 'nyxlink.crossfade']);
function append<T>(items: T[], value: T, limit: number): void {
    items.push(value);
    if (items.length > limit) items.shift();
}

/** Host feeds sanitized Pino event records and explicitly exported finished spans.
 * No sampling, global provider, polling, audio commands or UI dependencies.
 */
export class AuroraInspectorStore {
    private readonly explorer: AuroraCapabilityExplorer;
    private readonly events: InspectorEvent[] = [];
    private readonly spans: InspectorSpan[] = [];
    private readonly players = new WeakMap<Player, string>();
    private nextPlayer = 0;
    constructor(private readonly manager: Manager, private readonly capacity = 200) {
        if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10000) throw new RangeError('Invalid inspector capacity');
        this.explorer = new AuroraCapabilityExplorer(manager);
    }
    recordEvent(input: unknown): boolean {
        if (!input || typeof input !== 'object') return false;
        const record = input as Record<string, unknown>;
        const code = record.eventCode;
        if (typeof code !== 'string' || !Object.hasOwn(auroraCatalog, code)) return false;
        const definition = auroraCatalog[code as AuroraEventCode];
        const context = record.sanitizedContext as Record<string, unknown> | undefined;
        const event: InspectorEvent = { code: code as AuroraEventCode, category: definition.category,
            level: definition.level, message: definition.message, backend: backend(context?.backend) };
        if (typeof record.timestamp === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.timestamp)) event.timestamp = record.timestamp;
        if (duration(record.durationMs)) event.durationMs = record.durationMs;
        if (hex(record.traceId, 32) && hex(record.spanId, 16)) {
            event.traceId = record.traceId; event.spanId = record.spanId;
        }
        append(this.events, event, this.capacity);
        return true;
    }
    /** Call only with a completed span from a host exporter. Never copy attributes or exceptions. */
    recordSpan(input: unknown): boolean {
        if (!input || typeof input !== 'object') return false;
        const span = input as Record<string, unknown>;
        if (typeof span.name !== 'string' || !spanNames.has(span.name) ||
            !hex(span.traceId, 32) || !hex(span.spanId, 16) || !duration(span.durationMs) ||
            (span.outcome !== 'ok' && span.outcome !== 'error' && span.outcome !== 'unset')) return false;
        const value: InspectorSpan = { name: span.name, traceId: span.traceId, spanId: span.spanId,
            durationMs: span.durationMs, outcome: span.outcome };
        if (hex(span.parentSpanId, 16) && span.parentSpanId !== span.spanId) value.parentSpanId = span.parentSpanId;
        append(this.spans, value, this.capacity);
        return true;
    }
    snapshot(): InspectorSnapshot {
        const players: InspectorPlayer[] = [];
        for (const player of this.manager.players.all) {
            if (player.destroyed) continue;
            let alias = this.players.get(player);
            if (!alias) { alias = 'PLAYER-' + String(++this.nextPlayer).padStart(2, '0'); this.players.set(player, alias); }
            const state = !player.connected ? 'unknown' : player.paused ? 'paused' : player.playing ? 'playing' : 'idle';
            players.push({ alias, state, backend: backend(player.node.backend?.kind) });
        }
        return { source: 'live', nodes: this.explorer.snapshot(), players,
            events: this.events.map(x => ({ ...x })), spans: this.spans.map(x => ({ ...x })) };
    }
}
