import type { Manager } from '../core/Manager';
import type { Player } from '../entities/Player';
import { type AuroraEvent } from './AuroraEvents';
import type { FailoverReasonCode } from '../typings/Interfaces';
import type { CapabilityDescription } from '../backends/CapabilityRegistry';
export interface MusicSnapshot {
    state: 'playing' | 'paused' | 'idle' | 'ended' | 'unknown';
    positionMs?: number;
    durationMs?: number;
    stream: boolean;
    estimated: boolean;
    crossfadeConfigured: boolean;
}
export declare class AuroraMusicStrip {
    private readonly player;
    private readonly now;
    private readonly disposers;
    private anchor?;
    private ended;
    private closed;
    constructor(player: Player, now?: () => number);
    snapshot(): MusicSnapshot;
    close(): void;
}
export type IncidentState = 'recovering' | 'recovered' | 'degraded' | 'failed' | 'cancelled';
export interface IncidentSnapshot {
    operationId: string;
    state: IncidentState;
    backend: 'lavalink' | 'nodelink' | 'unknown';
    durationMs?: number;
    sourceBackend?: 'lavalink' | 'nodelink' | 'unknown';
    reasonCode?: FailoverReasonCode;
}
export declare class AuroraIncidentEngine {
    private readonly capacity;
    private readonly incidents;
    constructor(capacity?: number);
    accept(event: AuroraEvent): IncidentSnapshot | undefined;
    snapshot(): IncidentSnapshot[];
}
export interface CapabilityNode {
    alias: string;
    backend: 'lavalink' | 'nodelink' | 'unknown';
    ready: boolean;
    draining: boolean;
    latencyMs?: number;
    memoryUsedBytes?: number;
    capabilities: CapabilityDescription[];
}
export declare class AuroraCapabilityExplorer {
    private readonly manager;
    private readonly aliases;
    private nextAlias;
    constructor(manager: Manager);
    snapshot(): CapabilityNode[];
}
