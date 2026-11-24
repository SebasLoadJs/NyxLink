import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Manager } from '../core/Manager';
import type { Player } from '../entities/Player';

export type AuroraLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type AuroraCategory = 'CORE' | 'MANAGER' | 'NODE' | 'LAVALINK' | 'NODELINK' | 'WEBSOCKET' | 'REST' | 'PLAYER' | 'QUEUE' | 'TRACK' | 'SEARCH' | 'FILTERS' | 'AUTOPLAY' | 'CROSSFADE' | 'FAILOVER' | 'HEALTH' | 'PLUGIN' | 'TELEMETRY';
export type AuroraOutcome = 'observed' | 'started' | 'confirmed' | 'failed' | 'cancelled';
type Definition = { category: AuroraCategory; level: AuroraLevel; outcome: AuroraOutcome; message: string };
export const auroraCatalog = {
    NODE_READY: { category: 'NODE', level: 'info', outcome: 'confirmed', message: 'Backend session ready' },
    NODE_ERROR: { category: 'NODE', level: 'error', outcome: 'failed', message: 'Backend reported an error' },
    NODE_DISCONNECTED: { category: 'WEBSOCKET', level: 'warn', outcome: 'observed', message: 'Backend disconnected' },
    NODE_RECONNECTING: { category: 'WEBSOCKET', level: 'info', outcome: 'started', message: 'Backend reconnect attempt' },
    NODE_RESUMED: { category: 'NODE', level: 'info', outcome: 'confirmed', message: 'Backend session resumed' },
    TRACK_STARTED: { category: 'TRACK', level: 'info', outcome: 'observed', message: 'Backend reported track start' },
    TRACK_CROSSFADING: { category: 'CROSSFADE', level: 'info', outcome: 'observed', message: 'Backend reported crossfade transition' },
    TRACK_GAPLESS: { category: 'CROSSFADE', level: 'info', outcome: 'observed', message: 'Backend reported gapless transition' },
    PLAYER_RESUMED: { category: 'PLAYER', level: 'info', outcome: 'observed', message: 'Player session state restored' },
    TRACK_FAILED: { category: 'TRACK', level: 'error', outcome: 'failed', message: 'Backend reported playback exception' },
    QUEUE_ADDED: { category: 'QUEUE', level: 'debug', outcome: 'observed', message: 'Tracks queued' },
    QUEUE_ENDED: { category: 'QUEUE', level: 'info', outcome: 'observed', message: 'Queue exhausted' },
    AUTOPLAY_INSERTED: { category: 'AUTOPLAY', level: 'info', outcome: 'observed', message: 'Autoplay track selected' },
    FAILOVER_STARTED: { category: 'FAILOVER', level: 'info', outcome: 'started', message: 'Recovery initiated' },
    FAILOVER_RECOVERED: { category: 'FAILOVER', level: 'info', outcome: 'confirmed', message: 'Recovery confirmed by protocol' },
    FAILOVER_FAILED: { category: 'FAILOVER', level: 'error', outcome: 'failed', message: 'Recovery failed' },
    FAILOVER_CANCELLED: { category: 'FAILOVER', level: 'warn', outcome: 'cancelled', message: 'Recovery cancelled' },
} as const satisfies Record<string, Definition>;
export type AuroraEventCode = keyof typeof auroraCatalog;
export type AuroraContext = {
    backend?: 'lavalink' | 'nodelink' | 'unknown';
    attempt?: number;
    trackCount?: number;
};
export type AuroraEvent = {
    eventCode: AuroraEventCode;
    category: AuroraCategory;
    severity: AuroraLevel;
    outcome: AuroraOutcome;
    timestamp: string;
    durationMs?: number;
    operationId?: string;
    sanitizedContext: AuroraContext;
    traceId?: string;
    spanId?: string;
};
export type AuroraPinoTarget = Record<AuroraLevel, (event: AuroraEvent, message: string) => unknown>;
export interface AuroraEventOptions {
    level?: AuroraLevel | 'silent';
    categories?: readonly AuroraCategory[];
    /** Host-provided Pino instance; configure one destination in the host. */
    target: AuroraPinoTarget;
    /** Optional host-owned active trace context provider. */
    traceContext?: () => { traceId: string; spanId: string } | undefined;
}
const ranks: Record<AuroraLevel | 'silent', number> = {
    trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: Infinity,
};
const backend = (value: unknown): NonNullable<AuroraContext['backend']> =>
    value === 'lavalink' || value === 'nodelink' ? value : 'unknown';
const count = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const validHex = (value: unknown, length: number): value is string =>
    typeof value === 'string' && value.length === length && /^[a-f0-9]+$/.test(value) && !/^0+$/.test(value);
type Operation = { id: string; started: number };

/** Single opt-in, allowlisted event route. No raw debug or backend payloads. */
export class AuroraEvents {
    private readonly minimum: number;
    private readonly categories?: Set<AuroraCategory>;
    private readonly operations = new WeakMap<Player, Operation>();
    private disposers: Array<() => void> = [];
    private closed = false;

    constructor(private readonly options: AuroraEventOptions) {
        this.minimum = ranks[options.level ?? 'silent'];
        if (this.minimum === undefined) throw new TypeError('Invalid Aurora log level');
        this.categories = options.categories ? new Set(options.categories) : undefined;
        if (!options.target || Object.keys(ranks).filter(level => level !== 'silent').some(level =>
            typeof options.target[level as AuroraLevel] !== 'function')) throw new TypeError('Aurora requires a Pino-compatible target');
    }

    private emit(code: AuroraEventCode, input: AuroraContext = {}, operation?: Operation, finished = false): void {
        const definition = auroraCatalog[code];
        if (this.closed || ranks[definition.level] < this.minimum ||
            (this.categories && !this.categories.has(definition.category))) return;
        const context: AuroraContext = {};
        if (input.backend !== undefined) context.backend = backend(input.backend);
        const attempt = count(input.attempt), trackCount = count(input.trackCount);
        if (attempt !== undefined) context.attempt = attempt;
        if (trackCount !== undefined) context.trackCount = trackCount;
        const event: AuroraEvent = {
            eventCode: code, category: definition.category, severity: definition.level, outcome: definition.outcome,
            timestamp: new Date().toISOString(), sanitizedContext: context,
            ...(operation ? { operationId: operation.id } : {}),
            ...(operation && finished ? { durationMs: performance.now() - operation.started } : {}),
        };
        try {
            const trace = this.options.traceContext?.();
            if (trace && validHex(trace.traceId, 32) && validHex(trace.spanId, 16)) {
                event.traceId = trace.traceId;
                event.spanId = trace.spanId;
            }
        } catch { /* tracing is optional */ }
        try { this.options.target[definition.level](event, definition.message); }
        catch { /* diagnostics never break audio */ }
    }

    attach(manager: Manager): void {
        if (this.closed || this.disposers.length) throw new Error('Aurora event route is already attached or closed');
        if (this.minimum === Infinity) return;
        this.disposers.push(
            manager.on('nodeReady', node => this.emit('NODE_READY', { backend: backend(node.backend?.kind) })),
            manager.on('nodeError', node => this.emit('NODE_ERROR', { backend: backend(node.backend?.kind) })),
            manager.on('nodeDisconnect', node => this.emit('NODE_DISCONNECTED', { backend: backend(node.backend?.kind) })),
            manager.on('nodeReconnecting', (node, attempt) => this.emit('NODE_RECONNECTING', { backend: backend(node.backend?.kind), attempt })),
            manager.on('nodeResume', node => this.emit('NODE_RESUMED', { backend: backend(node.backend?.kind) })),
            manager.on('trackStart', player => this.emit('TRACK_STARTED', { backend: backend(player.node.backend?.kind) })),
            manager.on('trackEnd', (player, _track, reason) => {
                if (reason === 'crossfading' || reason === 'gapless') this.emit(reason === 'crossfading' ? 'TRACK_CROSSFADING' : 'TRACK_GAPLESS', { backend: backend(player.node.backend?.kind) });
            }),
            manager.on('playerResumed', player => this.emit('PLAYER_RESUMED', { backend: backend(player.node.backend?.kind) })),
            manager.on('trackException', player => this.emit('TRACK_FAILED', { backend: backend(player.node.backend?.kind) })),
            manager.on('queueAdd', (player, tracks) => this.emit('QUEUE_ADDED', { backend: backend(player.node.backend?.kind), trackCount: Array.isArray(tracks) ? tracks.length : 1 })),
            manager.on('queueEnd', player => this.emit('QUEUE_ENDED', { backend: backend(player.node.backend?.kind) })),
            manager.on('autoPlayed', player => this.emit('AUTOPLAY_INSERTED', { backend: backend(player.node.backend?.kind) })),
            manager.on('playerNodeFailover', (player, report) => {
                const context = { backend: backend(player.node.backend?.kind) };
                if (report.status === 'in-progress') {
                    const operation = { id: randomUUID(), started: performance.now() };
                    this.operations.set(player, operation);
                    this.emit('FAILOVER_STARTED', context, operation);
                } else {
                    const operation = this.operations.get(player);
                    this.operations.delete(player);
                    const code = report.status === 'recovered' ? 'FAILOVER_RECOVERED' :
                        report.status === 'failed' ? 'FAILOVER_FAILED' :
                        report.status === 'cancelled' ? 'FAILOVER_CANCELLED' : undefined;
                    if (code) this.emit(code, context, operation, true);
                }
            }),
        );
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        for (const dispose of this.disposers.splice(0)) {
            try { dispose(); } catch { /* independent cleanup */ }
        }
    }
}
