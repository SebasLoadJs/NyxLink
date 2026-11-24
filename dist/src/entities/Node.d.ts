import type { LyricsRequestOptions, SourceHealthResponse, NodeLinkStreamFormats } from '../backends/NodeLinkContracts';
import type { LavaLyricsData, LavaLyricsOptions } from '../backends/LavaLyricsContracts';
import type { LavalinkSponsorBlockCategory } from '../backends/LavalinkSponsorBlockContracts';
import { SourceHealthMonitor } from '../nodes/SourceHealthMonitor';
import type { BackendAdapter } from "../backends/BackendAdapter";
import { NodeCircuitBreaker } from '../nodes/NodeCircuitBreaker';
import { IManagerNodeConfig, INodeStats, ITrack, ILyricsData, IFilters } from "../typings/Interfaces";
import type { Manager } from "../core/Manager";
import type { Player } from "./Player";
import { Rest } from "./Rest";
import { type NodeLinkResponse } from "../Util";
import { WebSocket } from "../services/WebSocket";
import { NodeState, TrackEndReason } from "../typings/types";
import { Track } from "./Track";
import { YouTubeLiveChat, YouTubeLiveChatOptions } from "./YouTubeLiveChat";
type LavalinkEventBase = {
    op: "event";
    guildId: string;
};
type TrackStartEvent = LavalinkEventBase & {
    type: "TrackStartEvent";
    track: ITrack;
};
type TrackEndEvent = LavalinkEventBase & {
    type: "TrackEndEvent";
    track: ITrack | null;
    reason: TrackEndReason;
    crossfade?: {
        durationMs?: number;
        mode?: string;
        curve?: string;
        transition?: string | null;
        nextTrack?: ITrack | null;
    };
};
type TrackStuckEvent = LavalinkEventBase & {
    type: "TrackStuckEvent";
    track?: ITrack;
    thresholdMs: number;
};
type TrackExceptionEvent = LavalinkEventBase & {
    type: "TrackExceptionEvent";
    track?: ITrack;
    exception: {
        severity: string;
        message?: string;
    } & Record<string, any>;
};
type MixStartedEvent = LavalinkEventBase & {
    type: "MixStartedEvent";
    mixId: string;
    track: ITrack;
    volume: number;
};
type MixEndedEvent = LavalinkEventBase & {
    type: "MixEndedEvent";
    mixId: string;
    reason: string;
};
type LyricsNotFoundEvent = LavalinkEventBase & {
    type: "LyricsNotFoundEvent";
};
type LyricsFoundEvent = LavalinkEventBase & {
    type: "LyricsFoundEvent";
    lyrics?: Record<string, any>;
};
type LyricsLineEvent = LavalinkEventBase & {
    type: "LyricsLineEvent";
    lineIndex?: number;
    line?: Record<string, any>;
    skipped?: boolean;
};
type ConnectionStatusEvent = LavalinkEventBase & {
    type: "ConnectionStatusEvent";
    status?: string;
    connected?: boolean;
};
type VolumeChangedEvent = LavalinkEventBase & {
    type: "VolumeChangedEvent";
    volume?: number;
};
type FiltersChangedEvent = LavalinkEventBase & {
    type: "FiltersChangedEvent";
    filters?: Record<string, any>;
};
type SeekEvent = LavalinkEventBase & {
    type: "SeekEvent";
    position?: number;
};
type PauseEvent = LavalinkEventBase & {
    type: "PauseEvent";
    paused?: boolean;
};
type PlayerCreatedEvent = LavalinkEventBase & {
    type: "PlayerCreatedEvent";
    player?: Record<string, any>;
};
type PlayerDestroyedEvent = LavalinkEventBase & {
    type: "PlayerDestroyedEvent";
};
type PlayerReconnectingEvent = LavalinkEventBase & {
    type: "PlayerReconnectingEvent";
    reason?: string;
};
type PlayerConnectedEvent = LavalinkEventBase & {
    type: "PlayerConnectedEvent";
    voice?: Record<string, any>;
};
type EternalBoxInfoEvent = LavalinkEventBase & {
    type: "EternalBoxInfoEvent";
    info?: Record<string, any>;
};
type EternalBoxJumpEvent = LavalinkEventBase & {
    type: "EternalBoxJumpEvent";
    track?: ITrack;
};
type StreamMetadataEvent = LavalinkEventBase & {
    type: "StreamMetadataEvent";
    metadata?: Record<string, any>;
};
type WebSocketClosedEvent = LavalinkEventBase & {
    type: "WebSocketClosedEvent";
    code: number;
    reason: string;
    byRemote: boolean;
};
type WorkerFailedEvent = {
    op: "event";
    type: "WorkerFailedEvent";
    affectedGuilds: string[];
    message?: string;
};
type LavalinkEventPayload = TrackStartEvent | TrackEndEvent | TrackStuckEvent | TrackExceptionEvent | MixStartedEvent | MixEndedEvent | ConnectionStatusEvent | VolumeChangedEvent | FiltersChangedEvent | SeekEvent | PauseEvent | PlayerCreatedEvent | PlayerDestroyedEvent | PlayerReconnectingEvent | PlayerConnectedEvent | EternalBoxInfoEvent | EternalBoxJumpEvent | StreamMetadataEvent | LyricsFoundEvent | LyricsLineEvent | LyricsNotFoundEvent | WebSocketClosedEvent | WorkerFailedEvent;
export declare class Node {
    readonly manager: Manager;
    readonly uuid: string;
    host: string;
    port: number;
    identifier: string;
    password: string;
    pathVersion: string;
    connected: boolean;
    destroyed: boolean;
    reconnectTimeout?: NodeJS.Timeout;
    reconnectAttempts: number;
    retryAmount: number;
    retryDelay: number;
    readonly retryJitter: number;
    resumed: boolean;
    resumeTimeout: number;
    private resumeUpdateTimeout?;
    private resumeUpdateAttempts;
    private resumeUpdateInProgress;
    private resumeUpdateMaxAttempts;
    private resumeUpdateBaseDelay;
    private resumeWindowTimeout?;
    private resumeWindowActive;
    private pendingRecovery;
    private recoveryInProgress;
    regions: string[];
    secure: boolean;
    sessionId: string;
    priority?: number;
    socket?: WebSocket | null;
    stats?: INodeStats;
    statsReceivedAt?: number;
    info?: any;
    version?: string;
    isNodeLink: boolean;
    backend?: BackendAdapter;
    private backendReady;
    private backendGeneration;
    readonly sourceHealth: SourceHealthMonitor;
    private backendRefresh?;
    backendRefreshedAt?: number;
    private authenticationFailed;
    private connecting;
    private readyTimeout?;
    private readonly voiceReconnectTimers;
    private readonly readyTimeoutMs;
    url: string;
    rest: Rest;
    private lastStats?;
    state: NodeState;
    capabilities: Set<string>;
    readonly circuit: NodeCircuitBreaker;
    draining: boolean;
    constructor(manager: Manager, config: IManagerNodeConfig);
    get latency(): number;
    get health(): import("../nodes/NodeHealthMonitor").NodeHealth;
    assertFeature(feature: string): void;
    getPenalties(): number;
    ping(): Promise<number>;
    createYouTubeLiveChat(identifier: string, options?: YouTubeLiveChatOptions): YouTubeLiveChat;
    getLavalinkSponsorBlockCategories(guildId: string): Promise<LavalinkSponsorBlockCategory[]>;
    setLavalinkSponsorBlockCategories(guildId: string, categories: LavalinkSponsorBlockCategory[]): Promise<void>;
    clearLavalinkSponsorBlockCategories(guildId: string): Promise<void>;
    getLavaLyrics(track: string | ITrack | Track | {
        encoded?: string;
    }, options?: LavaLyricsOptions): Promise<LavaLyricsData | null>;
    loadLyrics(track: string | ITrack | Track | {
        encoded?: string;
    }, options?: string | LyricsRequestOptions): Promise<NodeLinkResponse<ILyricsData | Record<string, any>> | null>;
    getSourceHealth(): Promise<SourceHealthResponse>;
    getStreamFormats(track: string | ITrack | Track | {
        encoded?: string;
    }, options?: {
        itag?: number;
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<NodeLinkStreamFormats>;
    loadSourceStream(track: string | ITrack | Track | {
        encoded?: string;
    }, options?: {
        itag?: number;
        position?: number;
        range?: string;
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<{
        stream: NodeJS.ReadableStream;
        headers: Record<string, any>;
        statusCode: number;
    }>;
    loadDirectStream(track: string | ITrack | Track | {
        encoded?: string;
    }, volume?: number, position?: number, filters?: IFilters | Record<string, any>, options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
        seekMode?: 'server' | 'pcm-trim';
    }): Promise<{
        stream: NodeJS.ReadableStream;
        headers: Record<string, any>;
    }>;
    getDirectStream(track: string | ITrack | Track | {
        encoded?: string;
    }, itag?: number | null): Promise<any | null>;
    get address(): string;
    setState(state: NodeState): void;
    private get sessionStoragePath();
    private loadStoredSessionId;
    connect(): Promise<void>;
    private calculateReconnectDelay;
    probe(): Promise<boolean>;
    reconnect(): void;
    private resetResumeUpdateState;
    private cancelResumeWindow;
    private startResumeWindow;
    private scheduleResumeUpdateRetry;
    private enableResumeWithRetry;
    private startDisasterRecovery;
    private invalidateBackendRefresh;
    private clearBackendMetadata;
    refreshBackend(): Promise<boolean>;
    protected open(): Promise<void>;
    protected close(event: {
        code: number;
        reason: string;
    }): Promise<void>;
    protected message({ data }: {
        data: string | Buffer;
    }): Promise<void>;
    protected handleEvent(player: any, payload: LavalinkEventPayload): void;
    private handleWorkerFailed;
    private handleTrackStart;
    private handleTrackEnd;
    private handleTrackStuck;
    private handleTrackException;
    private handleMixStarted;
    private handleMixEnded;
    private handleConnectionStatus;
    private handleVolumeChanged;
    private handleFiltersChanged;
    private handleSeek;
    private handlePause;
    private handlePlayerCreated;
    private handlePlayerDestroyed;
    private handlePlayerReconnecting;
    private handlePlayerConnected;
    private handleEternalBoxInfo;
    private handleEternalBoxJump;
    private handleStreamMetadata;
    private handleLyricsFound;
    private handleLyricsLine;
    private handleLyricsNotFound;
    cancelVoiceReconnect(player: Player): void;
    private clearVoiceReconnects;
    private recoverSpecialVoiceClose;
    private handleWebSocketClosed;
    updateRecommendations(player: any, track?: Track): Promise<void>;
    handleAutoPlay(player: any, previousTrack: any): Promise<boolean>;
    private handleQueueEnd;
    protected error({ error }: {
        error: unknown;
    }): void;
    destroy(): Promise<void>;
    private _resumePlayers;
}
export {};
