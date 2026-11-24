import type { FailoverReasonCode } from '../typings/Interfaces';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Manager } from '../core/Manager';
import { claimManagerLogRoute } from './ManagerLogRoute';
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
    SEARCH_COMPLETED: { category: 'SEARCH', level: 'debug', outcome: 'observed', message: 'Search returned results' },
    SEARCH_EMPTY: { category: 'SEARCH', level: 'debug', outcome: 'observed', message: 'Search returned no results' },
    SEARCH_FAILED: { category: 'SEARCH', level: 'error', outcome: 'failed', message: 'Search failed' },
    SEARCH_CANCELLED: { category: 'SEARCH', level: 'debug', outcome: 'cancelled', message: 'Search cancelled' },
    REST_COMPLETED: { category: 'REST', level: 'debug', outcome: 'observed', message: 'Backend request completed' },
    REST_FAILED: { category: 'REST', level: 'error', outcome: 'failed', message: 'Backend request failed' },
    REST_CANCELLED: { category: 'REST', level: 'debug', outcome: 'cancelled', message: 'Backend request cancelled' },
    STREAM_OPENED: { category: 'REST', level: 'debug', outcome: 'observed', message: 'Backend stream opened' },
    STREAM_OPEN_FAILED: { category: 'REST', level: 'error', outcome: 'failed', message: 'Backend stream opening failed' },
    STREAM_OPEN_CANCELLED: { category: 'REST', level: 'debug', outcome: 'cancelled', message: 'Backend stream opening cancelled' },
    TRACK_ENDED: { category: 'TRACK', level: 'debug', outcome: 'observed', message: 'Backend reported track end' },
    PLAYER_PAUSED: { category: 'PLAYER', level: 'debug', outcome: 'observed', message: 'Player paused' },
    PLAYER_UNPAUSED: { category: 'PLAYER', level: 'debug', outcome: 'observed', message: 'Player unpaused' },
    PLAYER_SEEKED: { category: 'PLAYER', level: 'debug', outcome: 'observed', message: 'Player seek reported' },
    PLAYER_STOPPED: { category: 'PLAYER', level: 'info', outcome: 'observed', message: 'Player stopped' },
    VOICE_CONNECTED: { category: 'PLAYER', level: 'info', outcome: 'observed', message: 'Voice connection reported' },
    VOICE_DISCONNECTED: { category: 'PLAYER', level: 'warn', outcome: 'observed', message: 'Voice disconnected' },
    FILTERS_UPDATED: { category: 'FILTERS', level: 'debug', outcome: 'observed', message: 'Player filters updated' },
    SOURCE_HEALTH_CHANGED: { category: 'HEALTH', level: 'debug', outcome: 'observed', message: 'Source health changed' },
    RECOVERY_STARTED: { category: 'PLAYER', level: 'debug', outcome: 'started', message: 'Player recovery started' },
    RECOVERY_SUCCEEDED: { category: 'PLAYER', level: 'info', outcome: 'observed', message: 'Player recovery success reported' },
    RECOVERY_FAILED: { category: 'PLAYER', level: 'error', outcome: 'failed', message: 'Player recovery failed' },
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
    reasonCode?: FailoverReasonCode;
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
export function safeFailoverReason(value: unknown): FailoverReasonCode | undefined {
    return value === 'source-cleanup-failed' || value === 'intent-cancelled' || value === 'restart-rejected' || value === 'migration-error' ? value : undefined;
}
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
        const reasonCode = safeFailoverReason(input.reasonCode);
        if (reasonCode) context.reasonCode = reasonCode;
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

    /** Exactly one terminal event per operation. Never forward request payloads or thrown errors. */
    async observe<T>(kind: 'search' | 'rest' | 'stream', run: () => Promise<T>, input: AuroraContext = {}, classify?: (result: T) => 'completed' | 'empty' | 'failed'): Promise<T> {
        const codes = kind === 'search'
            ? { completed: 'SEARCH_COMPLETED', empty: 'SEARCH_EMPTY', failed: 'SEARCH_FAILED', cancelled: 'SEARCH_CANCELLED' } as const
            : kind === 'stream'
                ? { completed: 'STREAM_OPENED', empty: 'STREAM_OPENED', failed: 'STREAM_OPEN_FAILED', cancelled: 'STREAM_OPEN_CANCELLED' } as const
                : { completed: 'REST_COMPLETED', empty: 'REST_COMPLETED', failed: 'REST_FAILED', cancelled: 'REST_CANCELLED' } as const;
        if (this.closed || this.minimum === Infinity || (this.categories && !this.categories.has(auroraCatalog[codes.completed].category))) return run();
        const operation = { id: randomUUID(), started: performance.now() };
        let result: T;
        try { result = await run(); }
        catch (error) {
            this.emit(error instanceof Error && error.name === 'AbortError' ? codes.cancelled : codes.failed, input, operation, true);
            throw error;
        }
        let outcome: 'completed' | 'empty' | 'failed' = 'completed';
        try { outcome = classify?.(result) ?? 'completed'; } catch { /* diagnostics cannot change the result */ }
        this.emit(codes[outcome] ?? codes.completed, input, operation, true);
        return result;
    }

    attach(manager: Manager): void {
        if (this.closed || this.disposers.length) throw new Error('Aurora event route is already attached or closed');
        this.disposers.push(claimManagerLogRoute(manager, this));
        if (this.minimum === Infinity) return;
        this.disposers.push(
            manager.on('nodeReady', node => this.emit('NODE_READY', { backend: backend(node.backend?.kind) })),
            manager.on('nodeError', node => this.emit('NODE_ERROR', { backend: backend(node.backend?.kind) })),
            manager.on('nodeDisconnect', node => this.emit('NODE_DISCONNECTED', { backend: backend(node.backend?.kind) })),
            manager.on('nodeReconnecting', (node, attempt) => this.emit('NODE_RECONNECTING', { backend: backend(node.backend?.kind), attempt })),
            manager.on('nodeResume', node => this.emit('NODE_RESUMED', { backend: backend(node.backend?.kind) })),
            manager.on('trackStart', player => this.emit('TRACK_STARTED', { backend: backend(player.node.backend?.kind) })),
            manager.on('trackEnd', (player, _track, reason) => {
                this.emit(reason === 'crossfading' ? 'TRACK_CROSSFADING' : reason === 'gapless' ? 'TRACK_GAPLESS' : 'TRACK_ENDED', { backend: backend(player.node.backend?.kind) });
            }),
            manager.on('playerPause', (player, paused) => this.emit(paused ? 'PLAYER_PAUSED' : 'PLAYER_UNPAUSED', { backend: backend(player.node.backend?.kind) })),
            manager.on('playerSeek', player => this.emit('PLAYER_SEEKED', { backend: backend(player.node.backend?.kind) })),
            manager.on('playerStop', player => this.emit('PLAYER_STOPPED', { backend: backend(player.node.backend?.kind) })),
            manager.on('playerConnected', player => this.emit('VOICE_CONNECTED', { backend: backend(player.node.backend?.kind) })),
            manager.on('playerDisconnected', player => this.emit('VOICE_DISCONNECTED', { backend: backend(player.node.backend?.kind) })),
            manager.on('filtersUpdate', player => this.emit('FILTERS_UPDATED', { backend: backend(player.node.backend?.kind) })),
            manager.on('sourceHealthChange', node => this.emit('SOURCE_HEALTH_CHANGED', { backend: backend(node.backend?.kind) })),
            manager.on('playerRecoveryStarted', player => this.emit('RECOVERY_STARTED', { backend: backend(player.node.backend?.kind) })),
            manager.on('playerRecoverySuccess', player => this.emit('RECOVERY_SUCCEEDED', { backend: backend(player.node.backend?.kind) })),
            manager.on('playerRecoveryFailed', player => this.emit('RECOVERY_FAILED', { backend: backend(player.node.backend?.kind) })),
            manager.on('playerResumed', player => this.emit('PLAYER_RESUMED', { backend: backend(player.node.backend?.kind) })),
            manager.on('trackException', player => this.emit('TRACK_FAILED', { backend: backend(player.node.backend?.kind) })),
            manager.on('queueAdd', (player, tracks) => this.emit('QUEUE_ADDED', { backend: backend(player.node.backend?.kind), trackCount: Array.isArray(tracks) ? tracks.length : 1 })),
            manager.on('queueEnd', player => this.emit('QUEUE_ENDED', { backend: backend(player.node.backend?.kind) })),
            manager.on('autoPlayed', player => this.emit('AUTOPLAY_INSERTED', { backend: backend(player.node.backend?.kind) })),
            manager.on('playerNodeFailover', (player, report) => {
                const context = { backend: backend(player.node.backend?.kind), reasonCode: safeFailoverReason(report.reasonCode) };
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
