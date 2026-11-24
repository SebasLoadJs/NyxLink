import type { FailoverReasonCode } from '../typings/Interfaces';
import type { Manager } from '../core/Manager';
import { type PinoOutputMeta } from './PinoEngine';
import type { Player } from '../entities/Player';
import type { MigrationStage, MigrationStageObservation } from '../players/PlayerMigration';
export type AuroraLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type AuroraCategory = 'CORE' | 'MANAGER' | 'NODE' | 'LAVALINK' | 'NODELINK' | 'WEBSOCKET' | 'REST' | 'PLAYER' | 'QUEUE' | 'TRACK' | 'SEARCH' | 'FILTERS' | 'AUTOPLAY' | 'CROSSFADE' | 'FAILOVER' | 'HEALTH' | 'PLUGIN' | 'TELEMETRY';
export type AuroraOutcome = 'observed' | 'started' | 'confirmed' | 'failed' | 'cancelled';
export declare const auroraCatalog: {
    readonly DASHBOARD_SNAPSHOT: {
        readonly category: "TELEMETRY";
        readonly level: "info";
        readonly outcome: "observed";
        readonly message: "Cluster dashboard observed";
    };
    readonly MANAGER_INITIALIZED: {
        readonly category: "CORE";
        readonly level: "info";
        readonly outcome: "observed";
        readonly message: "Manager initialized";
    };
    readonly EXTENSION_FAILED: {
        readonly category: "PLUGIN";
        readonly level: "error";
        readonly outcome: "failed";
        readonly message: "Extension lifecycle failed";
    };
    readonly MIGRATION_STAGE_STARTED: {
        readonly category: "FAILOVER";
        readonly level: "debug";
        readonly outcome: "started";
        readonly message: "Migration stage started";
    };
    readonly MIGRATION_STAGE_ACKNOWLEDGED: {
        readonly category: "FAILOVER";
        readonly level: "debug";
        readonly outcome: "confirmed";
        readonly message: "Migration stage acknowledged";
    };
    readonly MIGRATION_STAGE_FAILED: {
        readonly category: "FAILOVER";
        readonly level: "error";
        readonly outcome: "failed";
        readonly message: "Migration stage failed";
    };
    readonly MIGRATION_STAGE_CANCELLED: {
        readonly category: "FAILOVER";
        readonly level: "debug";
        readonly outcome: "cancelled";
        readonly message: "Migration stage cancelled";
    };
    readonly MIGRATION_STAGE_PARTIAL: {
        readonly category: "FAILOVER";
        readonly level: "warn";
        readonly outcome: "observed";
        readonly message: "Migration stage partially completed";
    };
    readonly NODE_READY: {
        readonly category: "NODE";
        readonly level: "info";
        readonly outcome: "confirmed";
        readonly message: "Backend session ready";
    };
    readonly NODE_ERROR: {
        readonly category: "NODE";
        readonly level: "error";
        readonly outcome: "failed";
        readonly message: "Backend reported an error";
    };
    readonly NODE_DISCONNECTED: {
        readonly category: "WEBSOCKET";
        readonly level: "warn";
        readonly outcome: "observed";
        readonly message: "Backend disconnected";
    };
    readonly NODE_RECONNECTING: {
        readonly category: "WEBSOCKET";
        readonly level: "info";
        readonly outcome: "started";
        readonly message: "Backend reconnect attempt";
    };
    readonly NODE_RESUMED: {
        readonly category: "NODE";
        readonly level: "info";
        readonly outcome: "confirmed";
        readonly message: "Backend session resumed";
    };
    readonly SEARCH_COMPLETED: {
        readonly category: "SEARCH";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Search returned results";
    };
    readonly SEARCH_EMPTY: {
        readonly category: "SEARCH";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Search returned no results";
    };
    readonly SEARCH_FAILED: {
        readonly category: "SEARCH";
        readonly level: "error";
        readonly outcome: "failed";
        readonly message: "Search failed";
    };
    readonly SEARCH_CANCELLED: {
        readonly category: "SEARCH";
        readonly level: "debug";
        readonly outcome: "cancelled";
        readonly message: "Search cancelled";
    };
    readonly REST_COMPLETED: {
        readonly category: "REST";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Backend request completed";
    };
    readonly REST_FAILED: {
        readonly category: "REST";
        readonly level: "error";
        readonly outcome: "failed";
        readonly message: "Backend request failed";
    };
    readonly REST_CANCELLED: {
        readonly category: "REST";
        readonly level: "debug";
        readonly outcome: "cancelled";
        readonly message: "Backend request cancelled";
    };
    readonly STREAM_OPENED: {
        readonly category: "REST";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Backend stream opened";
    };
    readonly STREAM_OPEN_FAILED: {
        readonly category: "REST";
        readonly level: "error";
        readonly outcome: "failed";
        readonly message: "Backend stream opening failed";
    };
    readonly STREAM_OPEN_CANCELLED: {
        readonly category: "REST";
        readonly level: "debug";
        readonly outcome: "cancelled";
        readonly message: "Backend stream opening cancelled";
    };
    readonly TRACK_ENDED: {
        readonly category: "TRACK";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Backend reported track end";
    };
    readonly PLAYER_PAUSED: {
        readonly category: "PLAYER";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Player paused";
    };
    readonly PLAYER_UNPAUSED: {
        readonly category: "PLAYER";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Player unpaused";
    };
    readonly PLAYER_SEEKED: {
        readonly category: "PLAYER";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Player seek reported";
    };
    readonly PLAYER_STOPPED: {
        readonly category: "PLAYER";
        readonly level: "info";
        readonly outcome: "observed";
        readonly message: "Player stopped";
    };
    readonly VOICE_CONNECTED: {
        readonly category: "PLAYER";
        readonly level: "info";
        readonly outcome: "observed";
        readonly message: "Voice connection reported";
    };
    readonly VOICE_DISCONNECTED: {
        readonly category: "PLAYER";
        readonly level: "warn";
        readonly outcome: "observed";
        readonly message: "Voice disconnected";
    };
    readonly FILTERS_UPDATED: {
        readonly category: "FILTERS";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Player filters updated";
    };
    readonly SOURCE_HEALTH_CHANGED: {
        readonly category: "HEALTH";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Source health changed";
    };
    readonly RECOVERY_STARTED: {
        readonly category: "PLAYER";
        readonly level: "debug";
        readonly outcome: "started";
        readonly message: "Player recovery started";
    };
    readonly RECOVERY_SUCCEEDED: {
        readonly category: "PLAYER";
        readonly level: "info";
        readonly outcome: "observed";
        readonly message: "Player recovery success reported";
    };
    readonly RECOVERY_FAILED: {
        readonly category: "PLAYER";
        readonly level: "error";
        readonly outcome: "failed";
        readonly message: "Player recovery failed";
    };
    readonly TRACK_STARTED: {
        readonly category: "TRACK";
        readonly level: "info";
        readonly outcome: "observed";
        readonly message: "Backend reported track start";
    };
    readonly TRACK_CROSSFADING: {
        readonly category: "CROSSFADE";
        readonly level: "info";
        readonly outcome: "observed";
        readonly message: "Backend reported crossfade transition";
    };
    readonly TRACK_GAPLESS: {
        readonly category: "CROSSFADE";
        readonly level: "info";
        readonly outcome: "observed";
        readonly message: "Backend reported gapless transition";
    };
    readonly PLAYER_RESUMED: {
        readonly category: "PLAYER";
        readonly level: "info";
        readonly outcome: "observed";
        readonly message: "Player session state restored";
    };
    readonly TRACK_FAILED: {
        readonly category: "TRACK";
        readonly level: "error";
        readonly outcome: "failed";
        readonly message: "Backend reported playback exception";
    };
    readonly QUEUE_ADDED: {
        readonly category: "QUEUE";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Tracks queued";
    };
    readonly QUEUE_ENDED: {
        readonly category: "QUEUE";
        readonly level: "info";
        readonly outcome: "observed";
        readonly message: "Queue exhausted";
    };
    readonly AUTOPLAY_INSERTED: {
        readonly category: "AUTOPLAY";
        readonly level: "info";
        readonly outcome: "observed";
        readonly message: "Autoplay track selected";
    };
    readonly FAILOVER_STARTED: {
        readonly category: "FAILOVER";
        readonly level: "info";
        readonly outcome: "started";
        readonly message: "Recovery initiated";
    };
    readonly FAILOVER_RECOVERED: {
        readonly category: "FAILOVER";
        readonly level: "info";
        readonly outcome: "confirmed";
        readonly message: "Recovery confirmed by protocol";
    };
    readonly FAILOVER_FAILED: {
        readonly category: "FAILOVER";
        readonly level: "error";
        readonly outcome: "failed";
        readonly message: "Recovery failed";
    };
    readonly FAILOVER_CANCELLED: {
        readonly category: "FAILOVER";
        readonly level: "warn";
        readonly outcome: "cancelled";
        readonly message: "Recovery cancelled";
    };
};
export type AuroraEventCode = keyof typeof auroraCatalog;
export type AuroraContext = {
    backend?: 'lavalink' | 'nodelink' | 'unknown';
    attempt?: number;
    trackCount?: number;
    reasonCode?: FailoverReasonCode;
    stage?: MigrationStage;
    stageStatus?: MigrationStageObservation['status'];
    httpStatus?: number;
    nodeCount?: number;
    playerCount?: number;
    playingCount?: number;
    queuedTracks?: number;
    sourceCount?: number;
};
export type AuroraEvent = {
    eventCode: AuroraEventCode;
    category: AuroraCategory;
    severity: AuroraLevel;
    outcome: AuroraOutcome;
    timestamp: string;
    durationMs?: number;
    operationId?: string;
    parentOperationId?: string;
    sanitizedContext: AuroraContext;
    traceId?: string;
    spanId?: string;
};
export type AuroraPinoTarget = Record<AuroraLevel, (event: AuroraEvent, message: string) => unknown>;
export declare function createAuroraPinoEngine(level: AuroraLevel, consume: (record: AuroraEvent, meta: PinoOutputMeta) => void, onError?: () => void): {
    target: AuroraPinoTarget;
    close(): void;
};
export interface AuroraEventOptions {
    level?: AuroraLevel | 'silent';
    categories?: readonly AuroraCategory[];
    target?: AuroraPinoTarget;
    traceContext?: () => {
        traceId: string;
        spanId: string;
    } | undefined;
}
export declare function safeFailoverReason(value: unknown): FailoverReasonCode | undefined;
export declare function normalizeAuroraEvent(input: unknown): AuroraEvent | undefined;
export declare class AuroraEvents {
    private readonly options;
    private readonly minimum;
    private readonly categories?;
    private readonly operations;
    private readonly correlation;
    private disposers;
    private closed;
    private readonly counters;
    getStats(): {
        closed: boolean;
        accepted: number;
        filtered: number;
        targetErrors: number;
        criticalTargetErrors: number;
    };
    constructor(options: AuroraEventOptions);
    private emit;
    observe<T>(kind: 'search' | 'rest' | 'stream', run: () => Promise<T>, input?: AuroraContext, classify?: (result: T) => 'completed' | 'empty' | 'failed'): Promise<T>;
    recordDashboard(input: Pick<AuroraContext, 'nodeCount' | 'playerCount' | 'playingCount' | 'queuedTracks' | 'sourceCount'>): void;
    recordInitialized(): void;
    recordExtensionFailure(): void;
    recordMigrationStage(player: Player, stage: MigrationStage, status: MigrationStageObservation['status']): void;
    attach(manager: Manager): void;
    close(): void;
}
