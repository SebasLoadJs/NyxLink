import type { Manager } from '../core/Manager';
import { type CapabilityNode } from './AuroraDiagnostics';
import { type AuroraEventCode, type AuroraCategory, type AuroraLevel } from './AuroraEvents';
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
    startTimeMs?: number;
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
export declare class AuroraInspectorStore {
    private readonly manager;
    private readonly capacity;
    private readonly explorer;
    private readonly events;
    private readonly spans;
    private readonly players;
    private readonly latency;
    private readonly historyLimit;
    private nextPlayer;
    constructor(manager: Manager, capacity?: number);
    recordEvent(input: unknown): boolean;
    recordSpan(input: unknown): boolean;
    sampleLatencies(now?: number): void;
    latencyHistory(alias: string): ReadonlyArray<{
        timeMs: number;
        latencyMs: number;
    }>;
    snapshot(): InspectorSnapshot;
}
