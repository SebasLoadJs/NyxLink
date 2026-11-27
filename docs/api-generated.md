# Generated public API

Generated from the built `dist/index.d.ts` export graph with `pnpm run docs:api`. Public/protected declaration signatures are preserved; private members are omitted. Types referenced by a signature are resolved by the installed SDK declarations, not by copying these snippets into an application.

For behavior, lifecycle, compatibility and examples, see [the API guide](api-reference.md).

## AudioNodeStatus

[Source declaration](../src/logging/LogFormatter.ts)

```ts
export type AudioNodeStatus = {
    name: string;
    backend: 'Lavalink' | 'NodeLink' | string;
    state: 'connected' | 'ready' | 'connecting' | 'disconnected' | 'degraded' | string;
    latencyMs?: number;
    players?: number;
};
```

## AuroraBootstrap

[Source declaration](../src/logging/AuroraBootstrap.ts)

```ts
export declare class AuroraBootstrap {
    constructor(manager: Manager, options?: BootstrapOptions);
    initialize(clientId: string): Promise<Manager>;
    observeNetwork(): Promise<BootstrapSnapshot>;
}
```

## AuroraCapabilityExplorer

[Source declaration](../src/logging/AuroraDiagnostics.ts)

```ts
export declare class AuroraCapabilityExplorer {
    constructor(manager: Manager);
    snapshot(): CapabilityNode[];
}
```

## auroraCatalog

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
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
    readonly MIX_STARTED: {
        readonly category: "PLAYER";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Audio mix layer started";
    };
    readonly MIX_ENDED: {
        readonly category: "PLAYER";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Audio mix layer ended";
    };
    readonly SPONSOR_SEGMENTS_LOADED: {
        readonly category: "PLUGIN";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "SponsorBlock segments loaded";
    };
    readonly SPONSOR_SEGMENT_SKIPPED: {
        readonly category: "PLUGIN";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "SponsorBlock segment skipped";
    };
    readonly CHAPTERS_LOADED: {
        readonly category: "PLUGIN";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Track chapters loaded";
    };
    readonly CHAPTER_STARTED: {
        readonly category: "PLUGIN";
        readonly level: "debug";
        readonly outcome: "observed";
        readonly message: "Track chapter started";
    };
    readonly AUDIO_FEATURES_SUSPENDED: {
        readonly category: "FAILOVER";
        readonly level: "warn";
        readonly outcome: "observed";
        readonly message: "Incompatible audio preferences suspended";
    };
    readonly MIX_RECOVERY_COMPLETED: {
        readonly category: "FAILOVER";
        readonly level: "info";
        readonly outcome: "confirmed";
        readonly message: "Mixer reconstruction acknowledged";
    };
    readonly MIX_RECOVERY_PARTIAL: {
        readonly category: "FAILOVER";
        readonly level: "warn";
        readonly outcome: "observed";
        readonly message: "Mixer reconstruction incomplete";
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
```

## AuroraCategory

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
export type AuroraCategory = 'CORE' | 'MANAGER' | 'NODE' | 'LAVALINK' | 'NODELINK' | 'WEBSOCKET' | 'REST' | 'PLAYER' | 'QUEUE' | 'TRACK' | 'SEARCH' | 'FILTERS' | 'AUTOPLAY' | 'CROSSFADE' | 'FAILOVER' | 'HEALTH' | 'PLUGIN' | 'TELEMETRY';
```

## AuroraContext

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
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
    segmentCount?: number;
    chapterCount?: number;
    suspendedCount?: number;
    mixCaptured?: number;
    mixRestored?: number;
    mixFailed?: number;
    mixSkipped?: number;
};
```

## AuroraEvent

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
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
```

## AuroraEventCode

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
export type AuroraEventCode = keyof typeof auroraCatalog;
```

## AuroraEventOptions

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
export interface AuroraEventOptions {
    level?: AuroraLevel | 'silent';
    categories?: readonly AuroraCategory[];
    target?: AuroraPinoTarget;
    traceContext?: () => {
        traceId: string;
        spanId: string;
    } | undefined;
}
```

## AuroraEvents

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
export declare class AuroraEvents {
    getStats(): {
        closed: boolean;
        accepted: number;
        filtered: number;
        targetErrors: number;
        criticalTargetErrors: number;
    };
    constructor(options: AuroraEventOptions);
    observe<T>(kind: 'search' | 'rest' | 'stream', run: () => Promise<T>, input?: AuroraContext, classify?: (result: T) => 'completed' | 'empty' | 'failed'): Promise<T>;
    recordDashboard(input: Pick<AuroraContext, 'nodeCount' | 'playerCount' | 'playingCount' | 'queuedTracks' | 'sourceCount'>): void;
    recordInitialized(): void;
    recordExtensionFailure(): void;
    recordMigrationStage(player: Player, stage: MigrationStage, status: MigrationStageObservation['status']): void;
    attach(manager: Manager): void;
    close(): void;
}
```

## AuroraIncidentEngine

[Source declaration](../src/logging/AuroraDiagnostics.ts)

```ts
export declare class AuroraIncidentEngine {
    constructor(capacity?: number);
    accept(event: AuroraEvent): IncidentSnapshot | undefined;
    snapshot(): IncidentSnapshot[];
}
```

## AuroraInspectorStore

[Source declaration](../src/logging/AuroraInspector.ts)

```ts
export declare class AuroraInspectorStore {
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
```

## AuroraLevel

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
export type AuroraLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
```

## AuroraMusicStrip

[Source declaration](../src/logging/AuroraDiagnostics.ts)

```ts
export declare class AuroraMusicStrip {
    constructor(player: Player, now?: () => number);
    snapshot(): MusicSnapshot;
    close(): void;
}
```

## AuroraOutcome

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
export type AuroraOutcome = 'observed' | 'started' | 'confirmed' | 'failed' | 'cancelled';
```

## AuroraPinoTarget

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
export type AuroraPinoTarget = Record<AuroraLevel, (event: AuroraEvent, message: string) => unknown>;
```

## AuroraPresentation

[Source declaration](../src/logging/AuroraPresentation.ts)

```ts
export declare class AuroraPresentation {
    constructor(tools: AuroraVisualToolkit, options?: AuroraVisualOptions);
    banner(manager: Pick<Manager, 'options'>): string;
    event(event: AuroraEvent): string;
}
```

## AuroraVisualOptions

[Source declaration](../src/logging/AuroraPresentation.ts)

```ts
export interface AuroraVisualOptions {
    columns?: number;
    color?: boolean;
    unicode?: boolean;
    isTTY?: boolean;
}
```

## AuroraVisualToolkit

[Source declaration](../src/logging/AuroraPresentation.ts)

```ts
export interface AuroraVisualToolkit {
    figlet(text: string, font: 'ANSI Shadow' | 'Slant' | 'Small'): string;
    gradient(text: string): string;
    paint(text: string, hex: string): string;
    box(text: string, width: number): string;
    width(text: string): number;
    strip(text: string): string;
    duration(ms: number): string;
    symbols: {
        info: string;
        success: string;
        warning: string;
        error: string;
    };
}
```

## BackendAdapter

[Source declaration](../src/backends/BackendAdapter.ts)

```ts
export declare abstract class BackendAdapter {
    readonly version: string;
    readonly capabilities: Set<string>;
    abstract readonly kind: BackendKind;
    readonly protocolVersion = 4;
    readonly registry: CapabilityRegistry;
    readonly plugins: readonly BackendPlugin[];
    constructor(version: string, capabilities: Set<string>, plugins?: readonly BackendPlugin[], kind?: BackendKind);
    supports(feature: string): boolean;
    featureStatus(feature: string): CapabilityState;
    describeFeature(feature: string): CapabilityDescription;
    listFeatures(): CapabilityDescription[];
    getPlugin(name: string): BackendPlugin | undefined;
    preparePlayerUpdate(payload: PlayerUpdatePayload, channelId?: string): PlayerUpdatePayload;
    resolveExtension(operation: ExtensionOperation, params?: ExtensionRouteParameters): ExtensionRoute;
    recordFeature(feature: string, state: CapabilityState): void;
}
```

## BackendDetector

[Source declaration](../src/backends/BackendDetector.ts)

```ts
export declare class BackendDetector {
    static detect(info: unknown, headers?: Record<string, unknown>, capabilities?: Set<string>): BackendAdapter | undefined;
}
```

## BackendInventoryEntry

[Source declaration](../src/backends/BackendInventory.ts)

```ts
export type BackendInventoryEntry = {
    identifier: string;
    state: NodeState;
    connected: boolean;
    ready: boolean;
    draining: boolean;
    kind?: BackendKind;
    version?: string;
    protocolVersion?: number;
    refreshedAt?: number;
    features: CapabilityDescription[];
    plugins: BackendPlugin[];
};
```

## BackendKind

[Source declaration](../src/backends/BackendAdapter.ts)

```ts
export type BackendKind = 'lavalink' | 'nodelink';
```

## BackendPlugin

[Source declaration](../src/backends/BackendAdapter.ts)

```ts
export type BackendPlugin = Readonly<{
    name: string;
    version: string;
}>;
```

## BackendPluginMethod

[Source declaration](../src/backends/BackendPluginRoutes.ts)

```ts
export type BackendPluginMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
```

## BackendPluginRequest

[Source declaration](../src/backends/BackendPluginRoutes.ts)

```ts
export interface BackendPluginRequest {
    guildId?: string;
    params?: Readonly<Record<string, string>>;
    query?: URLSearchParams;
    body?: Record<string, unknown>;
    timeoutMs?: number;
    signal?: AbortSignal;
}
```

## BackendPluginRoute

[Source declaration](../src/backends/BackendPluginRoutes.ts)

```ts
export interface BackendPluginRoute<T> {
    readonly backend: BackendKind;
    readonly plugin: string;
    readonly id: string;
    readonly scope: 'node' | 'player';
    readonly method: BackendPluginMethod;
    readonly path: string;
    readonly prefix?: 'v4' | 'root';
    readonly decode: (response: unknown) => T;
}
```

## BackendPluginRouteRegistry

[Source declaration](../src/backends/BackendPluginRoutes.ts)

```ts
export declare class BackendPluginRouteRegistry {
    register<T>(definition: BackendPluginRoute<T>): BackendPluginRoute<T>;
    owns(route: BackendPluginRoute<unknown>): boolean;
    remove(route: BackendPluginRoute<unknown>): boolean;
    list(): Omit<BackendPluginRoute<unknown>, 'decode'>[];
    close(): void;
}
```

## BootstrapOptions

[Source declaration](../src/logging/AuroraBootstrap.ts)

```ts
export interface BootstrapOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
    onSnapshot?: (snapshot: BootstrapSnapshot) => void;
}
```

## BootstrapPhase

[Source declaration](../src/logging/AuroraBootstrap.ts)

```ts
export type BootstrapPhase = 'initializing' | 'initialized' | 'initialization-failed' | 'connecting' | 'ready' | 'partial' | 'timeout' | 'cancelled' | 'no-nodes';
```

## BootstrapSnapshot

[Source declaration](../src/logging/AuroraBootstrap.ts)

```ts
export interface BootstrapSnapshot {
    phase: BootstrapPhase;
    durationMs: number;
    ready: number;
    total: number;
}
```

## CapabilityDescription

[Source declaration](../src/backends/CapabilityRegistry.ts)

```ts
export type CapabilityDescription = Readonly<{
    feature: string;
    state: CapabilityState;
    evidence: CapabilityEvidence;
}>;
```

## CapabilityEvidence

[Source declaration](../src/backends/CapabilityRegistry.ts)

```ts
export type CapabilityEvidence = 'protocol' | 'advertised' | 'observed' | 'none';
```

## CapabilityNode

[Source declaration](../src/logging/AuroraDiagnostics.ts)

```ts
export interface CapabilityNode {
    alias: string;
    backend: 'lavalink' | 'nodelink' | 'unknown';
    ready: boolean;
    draining: boolean;
    latencyMs?: number;
    memoryUsedBytes?: number;
    capabilities: CapabilityDescription[];
}
```

## CapabilityRegistry

[Source declaration](../src/backends/CapabilityRegistry.ts)

```ts
export declare class CapabilityRegistry {
    constructor(advertised: ReadonlySet<string>, known?: ReadonlySet<string>, unavailable?: ReadonlySet<string>);
    describe(feature: string): CapabilityDescription;
    record(feature: string, state: CapabilityState): void;
    list(): CapabilityDescription[];
}
```

## CapabilityState

[Source declaration](../src/backends/CapabilityRegistry.ts)

```ts
export type CapabilityState = 'available' | 'unavailable' | 'unknown';
```

## CircuitBreakerOptions

[Source declaration](../src/nodes/NodeCircuitBreaker.ts)

```ts
export type CircuitBreakerOptions = {
    failureThreshold?: number;
    windowMs?: number;
    cooldownMs?: number;
};
```

## CircuitOpenError

[Source declaration](../src/errors/CircuitOpenError.ts)

```ts
export declare class CircuitOpenError extends Error {
    readonly retryAt: number;
    readonly code = "CIRCUIT_OPEN";
    constructor(retryAt: number);
}
```

## CircuitState

[Source declaration](../src/nodes/NodeCircuitBreaker.ts)

```ts
export type CircuitState = 'closed' | 'open' | 'half-open';
```

## CommonPlayerUpdate

[Source declaration](../src/backends/ProtocolContracts.ts)

```ts
export interface CommonPlayerUpdate {
    track?: PlayerTrackUpdate;
    encodedTrack?: string | null;
    identifier?: string;
    position?: number;
    endTime?: number | null;
    volume?: number;
    paused?: boolean;
    filters?: IFilters;
    voice?: PlayerVoiceUpdate;
}
```

## Connectors

[Source declaration](../src/connectors/index.ts)

```ts
export declare const Connectors: {
    DiscordJs: typeof DiscordJs;
};
```

## createAuroraPinoEngine

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
export declare function createAuroraPinoEngine(level: AuroraLevel, consume: (record: AuroraEvent, meta: PinoOutputMeta) => void, onError?: () => void): {
    target: AuroraPinoTarget;
    close(): void;
};
```

## createBanner

[Source declaration](../src/logging/Banner.ts)

```ts
export declare function createBanner(color?: boolean): string;
```

## CrossfadeOptions

[Source declaration](../src/backends/NodeLinkContracts.ts)

```ts
export interface CrossfadeOptions {
    enabled: boolean;
    duration?: number;
    curve?: 'linear' | 'sine' | 'sinusoidal';
    mode?: 'stream' | 'smart' | 'preload';
    minBufferMs?: number;
    bufferMs?: number;
}
```

## DeezerSource

[Source declaration](../src/sources/deezer.ts)

```ts
export declare class DeezerSource {
    name: string;
    constructor(manager: Manager);
    match(query: string): boolean;
    search(query: string, options?: {
        limit?: number;
        signal?: AbortSignal;
    }): Promise<any>;
    load(query: string, options?: {
        limit?: number;
        signal?: AbortSignal;
    }): Promise<any>;
    resolve(query: string): Promise<any>;
}
```

## diagnoseError

[Source declaration](../src/logging/ErrorDiagnostics.ts)

```ts
export declare function diagnoseError(error: unknown, context?: DiagnosticContext): ErrorDiagnostic;
```

## DiagnosticContext

[Source declaration](../src/logging/SafeDiagnostics.ts)

```ts
export type DiagnosticContext = Readonly<Record<string, unknown>>;
```

## DurationSummary

[Source declaration](../src/observability/PerformanceMonitor.ts)

```ts
export interface DurationSummary {
    count: number;
    retained: number;
    p50Ms?: number;
    p95Ms?: number;
    maxMs?: number;
}
```

## ErrorDiagnostic

[Source declaration](../src/logging/ErrorDiagnostics.ts)

```ts
export interface ErrorDiagnostic {
    code: string;
    severity: 'error';
    message: string;
    action: string;
    retryable?: boolean;
    context: DiagnosticContext;
    error: unknown;
}
```

## ExtensionContext

[Source declaration](../src/extensions/ExtensionHost.ts)

```ts
export interface ExtensionContext {
    readonly manager: Manager;
    readonly signal: AbortSignal;
    on<E extends keyof IManagerEvents>(event: E, listener: (...args: Parameters<IManagerEvents[E]>) => void | Promise<void>): () => void;
}
```

## ExtensionLifecycleError

[Source declaration](../src/extensions/ExtensionHost.ts)

```ts
export declare class ExtensionLifecycleError extends Error {
    readonly extension: string;
    readonly code: 'EXTENSION_SETUP_FAILED' | 'EXTENSION_CLEANUP_FAILED' | 'EXTENSION_HANDLER_FAILED';
    constructor(extension: string, phase: 'setup' | 'cleanup' | 'handler', cause: unknown);
}
```

## ExtensionOperation

[Source declaration](../src/backends/ExtensionRoutes.ts)

```ts
export type ExtensionOperation = keyof typeof definitions;
```

## ExtensionOptions

[Source declaration](../src/extensions/ExtensionHost.ts)

```ts
export interface ExtensionOptions {
    setupTimeoutMs?: number;
    cleanupTimeoutMs?: number;
}
```

## ExtensionRoute

[Source declaration](../src/backends/ExtensionRoutes.ts)

```ts
export type ExtensionRoute = RouteDefinition;
```

## ExtensionRouteParameters

[Source declaration](../src/backends/ExtensionRoutes.ts)

```ts
export type ExtensionRouteParameters = {
    sessionId?: string;
    guildId?: string;
    mixId?: string;
    groupId?: string;
    query?: URLSearchParams;
};
```

## FadingCurve

[Source declaration](../src/typings/Interfaces.ts)

```ts
export type FadingCurve = "linear" | "exponential" | "logarithmic" | "s-curve";
```

## FailoverOptions

[Source declaration](../src/nodes/NodeFailover.ts)

```ts
export type FailoverOptions = {
    maxAttempts?: number;
    retryDelayMs?: number;
    retryJitter?: number;
    preserveOnFailure?: boolean;
};
```

## FailoverReasonCode

[Source declaration](../src/typings/Interfaces.ts)

```ts
export type FailoverReasonCode = 'source-cleanup-failed' | 'intent-cancelled' | 'restart-rejected' | 'migration-error';
```

## FailoverReport

[Source declaration](../src/logging/LogFormatter.ts)

```ts
export type FailoverReport = {
    source: string;
    target: string;
    status: 'recovered' | 'failed' | 'in-progress' | 'cancelled';
    positionMs?: number;
    guildId?: string;
    reason?: string;
};
```

## FailoverResult

[Source declaration](../src/nodes/NodeFailover.ts)

```ts
export type FailoverResult = {
    status: 'recovered' | 'failed' | 'cancelled';
    attempts: number;
    node?: Node;
    reason?: 'queue-full';
};
```

## FeatureUnavailableError

[Source declaration](../src/errors/FeatureUnavailableError.ts)

```ts
export declare class FeatureUnavailableError extends Error {
    readonly feature: string;
    readonly backend: string;
    readonly statusCode?: number | undefined;
    readonly code = "FEATURE_UNAVAILABLE";
    constructor(feature: string, backend: string, statusCode?: number | undefined);
}
```

## FencedGuildVoiceEnvelope

[Source declaration](../src/cluster/RedisGuildIpcRouter.ts)

```ts
export interface FencedGuildVoiceEnvelope {
    readonly protocol: 'nyxlink/guild-voice/2';
    readonly guildId: string;
    readonly fencingToken: number;
    readonly sequence: number;
    readonly commandId: string;
    readonly packet: GuildVoiceGatewayPacket;
}
```

## Filters

[Source declaration](../src/entities/Filters.ts)

```ts
export declare class Filters implements IFilters {
    volume?: number;
    equalizer?: IEqualizerBand[];
    karaoke?: IKaraoke;
    timescale?: ITimescale;
    tremolo?: ITremolo;
    vibrato?: IVibrato;
    rotation?: IRotation;
    distortion?: IDistortion;
    channelMix?: IChannelMix;
    lowPass?: ILowPass;
    echo?: IEcho;
    chorus?: IChorus;
    compressor?: ICompressor;
    highpass?: IHighPass;
    phaser?: IPhaser;
    spatial?: ISpatial;
    pluginFilters?: Record<string, any>;
    constructor(player: Player);
    get available(): string[];
    get enabled(): string[];
    get active(): Set<string>;
    list(): string[];
    set(name: string, value: string | IFilters): this;
    toJSON(): object;
    define(name: string, value: string | IFilters): this;
    has(name: string): boolean;
    isActive(name: string): boolean;
    enable(name: string): this;
    disable(name: string): this;
    toggle(name: string): this;
    enableMultiple(names: string[]): this;
    disableMultiple(names: string[]): this;
    setVolume(volume: number): this;
    setEqualizer(bands: IEqualizerBand[]): this;
    setKaraoke(karaoke?: IKaraoke): this;
    setTimescale(timescale?: ITimescale): this;
    setTremolo(tremolo?: ITremolo): this;
    setVibrato(vibrato?: IVibrato): this;
    setRotation(rotation?: IRotation): this;
    setDistortion(distortion?: IDistortion): this;
    setChannelMix(channelMix?: IChannelMix): this;
    setLowPass(lowPass?: ILowPass): this;
    setEcho(echo?: IEcho): this;
    setChorus(chorus?: IChorus): this;
    setCompressor(compressor?: ICompressor): this;
    setHighPass(highpass?: IHighPass): this;
    setPhaser(phaser?: IPhaser): this;
    setSpatial(spatial?: ISpatial): this;
    setSpeed(speed: number): this;
    setPitch(pitch: number): this;
    remove(filterName: string): this;
    setLavaDSPX<K extends LavaDSPXKey>(key: K, value?: NonNullable<LavaDSPXFilters[K]>): this;
    setPluginFilters(filters: Record<string, any>): this;
    clear(): this;
    reset(): this;
    toPayload(options?: {
        compatibleOnly?: boolean;
        suspended?: string[];
    }): IFilters;
    apply(options?: {
        compatibleOnly?: boolean;
    }): Promise<Player>;
}
```

## formatBox

[Source declaration](../src/logging/LogFormatter.ts)

```ts
export declare function formatBox(title: string, details?: Record<string, unknown>, width?: number): string;
```

## formatEntry

[Source declaration](../src/logging/LogFormatter.ts)

```ts
export declare function formatEntry(entry: LogEntry, options?: FormatterOptions): string;
```

## formatFailover

[Source declaration](../src/logging/LogFormatter.ts)

```ts
export declare function formatFailover(event: FailoverReport, options?: FormatterOptions): string;
```

## formatSystemStatus

[Source declaration](../src/logging/LogFormatter.ts)

```ts
export declare function formatSystemStatus(nodes: AudioNodeStatus[], options?: FormatterOptions): string;
```

## GroupCreate

[Source declaration](../src/backends/NodeLinkOrchestration.ts)

```ts
export interface GroupCreate {
    id: string;
    guildIds?: string[];
}
```

## GroupPatch

[Source declaration](../src/backends/NodeLinkOrchestration.ts)

```ts
export interface GroupPatch {
    players?: {
        add?: string[];
        remove?: string[];
    };
    track?: (PlayerTrackUpdate & {
        language?: string;
        audioTrackId?: string;
    }) | null;
    position?: number;
    endTime?: number | null;
    volume?: number;
    paused?: boolean;
    filters?: IFilters;
    fading?: IFadingOptions;
    loudnessNormalizer?: boolean;
    ducking?: boolean;
}
```

## GroupPatchResult

[Source declaration](../src/backends/NodeLinkOrchestration.ts)

```ts
export interface GroupPatchResult extends PlayerGroup {
    players: IRESTGetPlayers[];
    errors?: Array<{
        guildId: string;
        error: string;
    }>;
}
```

## GuildOwnership

[Source declaration](../src/cluster/GuildOwnership.ts)

```ts
export declare class GuildOwnership {
    constructor(manager: Manager, options: GuildOwnershipOptions);
    get isClosed(): boolean;
    localLease(guildId: string): RedisGuildLease | undefined;
    assertLocal(guildId: string): void;
    isCurrent(guildId: string): Promise<boolean>;
    assertCurrent(guildId: string): Promise<void>;
    acquire(guildId: string): Promise<RedisGuildLease>;
    release(guildId: string, expected?: RedisGuildLease): Promise<void>;
    close(): Promise<void>;
}
```

## GuildOwnershipOptions

[Source declaration](../src/cluster/GuildOwnership.ts)

```ts
export interface GuildOwnershipOptions {
    coordinator: RedisGuildLeaseCoordinator;
    renewIntervalMs?: number;
}
```

## GuildVoiceDispatchStatus

[Source declaration](../src/cluster/RedisGuildIpcRouter.ts)

```ts
export type GuildVoiceDispatchStatus = 'delivered' | 'stale' | 'duplicate';
```

## GuildVoiceGatewayPacket

[Source declaration](../src/cluster/RedisGuildIpcRouter.ts)

```ts
export interface GuildVoiceGatewayPacket {
    readonly op: 4;
    readonly d: {
        readonly guild_id: string;
        readonly channel_id: string | null;
        readonly self_deaf: boolean;
        readonly self_mute: boolean;
    };
}
```

## HoloAudioTrack

[Source declaration](../src/backends/HoloTrackMetadata.ts)

```ts
export interface HoloAudioTrack {
    id: string;
    name?: string;
    isDefault: boolean;
    isAutoDubbed: boolean;
}
```

## HoloTrackMetadata

[Source declaration](../src/backends/HoloTrackMetadata.ts)

```ts
export interface HoloTrackMetadata {
    type: 'holo';
    description?: string;
    publishedAt?: string;
    views?: number;
    likes?: number;
    channelName?: string;
    channelId?: string;
    channelVerified?: boolean;
    keywords: string[];
    audioTracks: HoloAudioTrack[];
    audioFormats: Record<string, unknown>[];
    videoQualities: Record<string, unknown>[];
    captions: Record<string, unknown>[];
    channel?: Record<string, unknown>;
    externalLinks?: Record<string, unknown>;
}
```

## HttpError

[Source declaration](../src/errors/HttpError.ts)

```ts
export declare class HttpError extends Error {
    readonly statusCode: number;
    readonly body?: unknown | undefined;
    readonly retryable: boolean;
    readonly retryAfterMs?: number;
    constructor(statusCode: number, body?: unknown | undefined, retryAfter?: string);
}
```

## HttpPolicyError

[Source declaration](../src/errors/HttpPolicyError.ts)

```ts
export declare class HttpPolicyError extends Error {
    readonly reason: HttpPolicyReason;
    readonly code = "HTTP_POLICY_REJECTED";
    constructor(reason: HttpPolicyReason);
}
```

## HttpPolicyReason

[Source declaration](../src/errors/HttpPolicyError.ts)

```ts
export type HttpPolicyReason = 'scheme' | 'credentials' | 'origin' | 'redirect-body' | 'redirect-limit' | 'pagination';
```

## IChannelMix

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IChannelMix {
    leftToLeft?: number;
    leftToRight?: number;
    rightToLeft?: number;
    rightToRight?: number;
}
```

## IChapter

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IChapter {
    title: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    thumbnails?: IChapterThumbnail[];
}
```

## IChapterThumbnail

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IChapterThumbnail {
    url: string;
    width: number;
    height: number;
}
```

## IChorus

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IChorus {
    rate?: number;
    depth?: number;
    delay?: number;
    mix?: number;
    feedback?: number;
}
```

## ICompressor

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ICompressor {
    threshold?: number;
    ratio?: number;
    attack?: number;
    release?: number;
    gain?: number;
}
```

## IDeezerOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IDeezerOptions {
    enabled?: boolean;
    maxSearchResults?: number;
    maxPlaylistTracks?: number;
    maxAlbumTracks?: number;
    maxArtistTracks?: number;
}
```

## IDefaultPlayerOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IDefaultPlayerOptions {
    volume?: number;
    autoPlay?: boolean;
    autoLeave?: boolean;
    selfDeaf?: boolean;
    selfMute?: boolean;
    loop?: "off" | "track" | "queue";
    historySize?: number;
}
```

## IDistortion

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IDistortion {
    sinOffset?: number;
    sinScale?: number;
    cosOffset?: number;
    cosScale?: number;
    tanOffset?: number;
    tanScale?: number;
    offset?: number;
    scale?: number;
}
```

## IEcho

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IEcho {
    delay?: number;
    feedback?: number;
    mix?: number;
}
```

## IEqualizerBand

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IEqualizerBand {
    band: number;
    gain: number;
}
```

## IFadingOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IFadingOptions {
    enabled?: boolean;
    trackStart?: IFadingSection;
    trackEnd?: IFadingSection;
    trackStop?: IFadingSection;
    seek?: IFadingSection;
    ducking?: IFadingSection;
}
```

## IFadingSection

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IFadingSection {
    duration?: number;
    curve?: FadingCurve;
}
```

## IFailingAddress

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IFailingAddress {
    failingAddress: string;
    failingTimestamp: number;
    failingTime: string;
}
```

## IFilters

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IFilters {
    volume?: number;
    equalizer?: IEqualizerBand[];
    karaoke?: IKaraoke;
    timescale?: ITimescale;
    tremolo?: ITremolo;
    vibrato?: IVibrato;
    rotation?: IRotation;
    distortion?: IDistortion;
    channelMix?: IChannelMix;
    lowPass?: ILowPass;
    echo?: IEcho;
    chorus?: IChorus;
    compressor?: ICompressor;
    highpass?: IHighPass;
    phaser?: IPhaser;
    spatial?: ISpatial;
    pluginFilters?: Record<string, any>;
}
```

## IHighPass

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IHighPass {
    smoothing?: number;
}
```

## IIpBlock

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IIpBlock {
    type: IpBlockType;
    size: string;
}
```

## IKaraoke

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IKaraoke {
    level?: number;
    monoLevel?: number;
    filterBand?: number;
    filterWidth?: number;
}
```

## ILowPass

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ILowPass {
    smoothing?: number;
}
```

## ILyricsData

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ILyricsData {
    synced: boolean;
    lang?: string;
    source?: string;
    lines: ILyricsLine[];
    name?: string;
    provider?: string;
    kind?: 'lyrics' | 'captions';
    introEndMs?: number;
    outroStartMs?: number;
    timing?: {
        granularity: 'none' | 'line' | 'token';
        totalLines: number;
        timedLines: number;
        tokenTimedLines: number;
    };
    attribution?: {
        name: string;
        url: string;
        submitter?: {
            name: string;
            url: string;
        };
    };
}
```

## ILyricsLine

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ILyricsLine {
    text: string;
    time: number | null;
    duration: number | null;
    words?: Array<Record<string, unknown>>;
    kind?: 'lyric' | 'instrumental';
    section?: string;
    agent?: string;
    isBackground?: boolean;
    alternatives?: Array<{
        kind: 'translation' | 'romanization';
        text: string;
        language?: string;
    }>;
}
```

## ILyricsResponse

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ILyricsResponse {
    loadType: "lyrics" | "empty";
    data: ILyricsData | Record<string, any>;
}
```

## IManagerConfig

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IManagerConfig {
    nodes: IManagerNodeConfig[];
    options?: IManagerOptionsConfig;
    send?: (guildId: string, payload: any) => void;
}
```

## IManagerEvents

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IManagerEvents {
    extensionError: (name: string, error: import('../extensions/ExtensionHost').ExtensionLifecycleError) => void;
    debug: (message: string) => void;
    nodeCreate: (node: Node) => void;
    nodeReady: (node: Node, payload: any) => void;
    nodeConnected: (node: Node) => void;
    nodeError: (node: Node, error: Error) => void;
    nodeReconnect: (node: Node) => void;
    nodeReconnecting: (node: Node, attempt: number) => void;
    nodeResume: (node: Node) => void;
    nodeDisconnect: (node: Node, code: number, reason: string) => void;
    nodeDestroy: (identifier: string) => void;
    nodeRaw: (node: Node, payload: any) => void;
    nodeStateChange: (node: Node, oldState: NodeState, newState: NodeState) => void;
    sourceHealthSnapshot: (node: Node, event: SourceHealthSnapshotEvent) => void;
    sourceHealthChange: (node: Node, event: SourceHealthChangeEvent) => void;
    playerCreate: (player: Player) => void;
    playerDestroy: (player: Player, reason?: string) => void;
    playerUpdate: (player: Player, track: Track | null, payload: any) => void;
    playerSwitchedNode: (player: Player, oldNode: Node, newNode: Node) => void;
    playerConnecting: (player: Player) => void;
    playerConnected: (player: Player, payload?: any) => void;
    playerReady: (player: Player) => void;
    playerResuming: (player: Player) => void;
    playerResumed: (player: Player) => void;
    playerDisconnected: (player: Player) => void;
    playerReconnect: (player: Player, reason?: string) => void;
    playerCreated: (player: Player, payload?: any) => void;
    playerDestroyed: (player: Player, payload?: any) => void;
    playerConnectionStatus: (player: Player, status: string | boolean | undefined, payload?: any) => void;
    playerSeek: (player: Player, position: number, payload?: any) => void;
    playerPause: (player: Player, paused: boolean, payload?: any) => void;
    playerStop: (player: Player) => void;
    playerMoved: (player: Player, oldChannel: string, newChannel: string) => void;
    playerMuteChange: (player: Player, selfMute: boolean, serverMute: boolean) => void;
    playerDeafChange: (player: Player, selfDeaf: boolean, serverDeaf: boolean) => void;
    playerSuppressChange: (player: Player, suppress: boolean) => void;
    playerAutoPlaySet: (player: Player, autoPlay: boolean) => void;
    playerAutoLeaveSet: (player: Player, autoLeave: boolean) => void;
    playerChangedVolume: (player: Player, oldVolume: number, volume: number) => void;
    playerVolumeError: (player: Player, error: Error, volume: number) => void;
    playerChangedLoop: (player: Player, oldLoop: PlayerLoop, loop: PlayerLoop, oldLoopCount?: number, newLoopCount?: number) => void;
    playerTextChannelIdSet: (player: Player, oldChannel: string, newChannel: string) => void;
    playerVoiceChannelIdSet: (player: Player, oldChannel: string, newChannel: string) => void;
    playerNodeSet: (player: Player, oldNode: string, newNode: string) => void;
    playerRecoveryStarted: (player: Player) => void;
    playerRecoverySuccess: (player: Player) => void;
    playerRecoveryFailed: (player: Player) => void;
    guildOwnershipLost: (guildId: string, fencingToken: number, reason: string) => void;
    playersMoved: (players: Player[], oldNode: Node, newNode: Node) => void;
    playersOrphaned: (players: Player[], deadNode: Node) => void;
    playerNodeFailover: (player: Player, report: INodeFailoverReport) => void;
    playerTriggeredPlay: (player: Player, track: Track) => void;
    playerTriggeredPause: (player: Player) => void;
    playerTriggeredResume: (player: Player) => void;
    playerTriggeredStop: (player: Player) => void;
    playerTriggeredSkip: (player: Player, oldTrack: Track | null, currentTrack: Track, position: number) => void;
    playerTriggeredSeek: (player: Player, position: number) => void;
    playerTriggeredShuffle: (player: Player, oldQueue: Record<string, any>, currentQueue: Track[]) => void;
    playerTriggeredBack: (player: Player, track: Track) => void;
    trackStart: (player: Player, track: Track) => void;
    trackEnd: (player: Player, track: Track, reason: TrackEndReason, payload?: any) => void;
    trackStuck: (player: Player, track: Track, threshold: number, payload?: any) => void;
    trackException: (player: Player, track: Track, exception: any, payload?: any) => void;
    sponsorBlockEvent: (player: Player, observation: import('../backends/SponsorBlockEvents').SponsorBlockObservation) => void;
    mixStart: (player: Player, mixId: string, track: Track, volume: number, payload?: any) => void;
    mixEnd: (player: Player, mixId: string, reason: string, payload?: any) => void;
    lyricsNotFound: (player: Player, payload?: any) => void;
    lyricsFound: (player: Player, payload?: any) => void;
    lyricsLine: (player: Player, payload?: any) => void;
    nodeLinkLyricsEvent: (player: Player, observation: import('../backends/NodeLinkLyricsEvents').NodeLinkLyricsObservation) => void;
    lavaLyricsEvent: (player: Player, observation: import('../backends/LavaLyricsContracts').LavaLyricsObservation) => void;
    queueAdd: (player: Player, tracks: Track | Track[]) => void;
    queueRemove: (player: Player, tracks: Track | Track[]) => void;
    queueMoveRange: (player: Player, tracks: Track[], fromIndex: number, toIndex: number) => void;
    queueRemoveRange: (player: Player, tracks: Track[], startIndex: number, endIndex: number) => void;
    queueDuplicate: (player: Player, tracks: Track[], index: number) => void;
    queueEnd: (player: Player, lastTrack?: Track) => void;
    filtersUpdate: (player: Player, filters: Filters) => void;
    socketClosed: (player: Player, code: number, reason: string, byRemote: boolean, payload?: any) => void;
    voiceSessionChanged: (player: Player, oldSessionId: string | boolean, sessionId: string) => void;
    autoPlayed: (player: Player, track: Track, previousTrack: Track) => void;
    autoLeaved: (player: Player, lastTrack?: Track) => void;
    streamMetadata: (player: Player, payload?: any) => void;
    eternalBoxInfo: (player: Player, payload?: any) => void;
    eternalBoxJump: (player: Player, payload?: any) => void;
}
```

## IManagerNodeConfig

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IManagerNodeConfig {
    readyTimeoutMs?: number;
    host: string;
    password: string;
    port: number;
    secure: boolean;
    identifier?: string;
    pathVersion?: string;
    retryDelay?: number;
    retryJitter?: number;
    retryAmount?: number;
    regions?: string[];
    priority?: number;
}
```

## IManagerOptionsConfig

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IManagerOptionsConfig {
    recommendations?: import('../autoplay/RecommendationPreference').RecommendationPreferences;
    recommendationDiscovery?: import('../autoplay/RecommendationDiscovery').RecommendationDiscoveryOptions;
    logging?: AuroraEventOptions;
    telemetry?: OpenTelemetryOptions;
    clientName?: string;
    userAgent?: string;
    noReplace?: boolean;
    resume?: boolean;
    resumeTimeout?: number;
    customFilters?: Record<string, string | IFilters>;
    defaultPlayer?: IDefaultPlayerOptions;
    voiceConnection?: IVoiceConnectionOptions;
    node?: INodeOptions;
    search?: ISearchOptions;
    queue?: IQueueOptions;
    sources?: ISourceOptions;
    spotify?: ISpotifyOptions;
    deezer?: IDeezerOptions;
    playerDestruction?: IPlayerDestructionOptions;
    trackHandling?: ITrackHandlingOptions;
    playerHealth?: IPlayerHealthOptions;
    trackPartial?: TPartialTrackProperties[];
    database?: {
        type: 'memory' | 'local' | 'external';
        adapter?: StorageAdapter;
        options?: any;
    };
}
```

## IMeaningResponse

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IMeaningResponse {
    loadType: string;
    data: Record<string, any>;
}
```

## IncidentSnapshot

[Source declaration](../src/logging/AuroraDiagnostics.ts)

```ts
export interface IncidentSnapshot {
    operationId: string;
    state: IncidentState;
    backend: 'lavalink' | 'nodelink' | 'unknown';
    durationMs?: number;
    sourceBackend?: 'lavalink' | 'nodelink' | 'unknown';
    reasonCode?: FailoverReasonCode;
}
```

## IncidentState

[Source declaration](../src/logging/AuroraDiagnostics.ts)

```ts
export type IncidentState = 'recovering' | 'recovered' | 'degraded' | 'failed' | 'cancelled';
```

## INode

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface INode {
    host: string;
    port: number;
    identifier: string;
    password?: string;
    pathVersion?: string;
    retryDelay?: number;
    retryAmount?: number;
    regions?: string[];
    secure?: boolean;
    priority?: number;
}
```

## INodeConnectionMetrics

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface INodeConnectionMetrics {
    speed?: {
        bps?: number;
        kbps?: number;
        mbps?: number;
    };
    downloadedBytes?: number;
    durationSeconds?: number;
    latencyMs?: number;
    endpoint?: {
        name?: string;
        url?: string;
        expectedSizeBytes?: number;
    };
    dns?: {
        isOnline?: boolean;
        host?: string;
        latencyMs?: number;
    };
    ping?: {
        host?: string;
        alive?: boolean;
        minMs?: number;
        avgMs?: number;
        maxMs?: number;
        packetLoss?: number;
    };
    network?: {
        isConnected?: boolean;
        connectionType?: string;
        ipAddress?: string;
        interfaceName?: string;
        dnsServers?: string[];
        gateway?: string;
    };
    timestamp?: number;
}
```

## INodeConnectionStatus

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface INodeConnectionStatus {
    status: string;
    metrics: INodeConnectionMetrics;
}
```

## INodeFailoverReport

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface INodeFailoverReport {
    source: string;
    target: string;
    status: 'in-progress' | 'recovered' | 'failed' | 'cancelled';
    positionMs?: number;
    reason?: string;
    reasonCode?: FailoverReasonCode;
    suspendedFeatures?: readonly string[];
    manualPreloadDiscarded?: boolean;
    mixRecovery?: import('../players/MixRecovery').MixRecoveryReport;
}
```

## INodeOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface INodeOptions {
    retryJitter?: number;
    recoveryConcurrency?: number;
    recoveryQueueLimit?: number;
    circuitBreaker?: CircuitBreakerOptions | false;
    failover?: FailoverOptions;
    mixRecovery?: import('../players/MixRecovery').MixRecoveryOptions;
    maxStatsAgeMs?: number;
    selectionStrategy?: NodeSortStrategy;
    retryDelay?: number;
    retryAmount?: number;
    avoidUnhealthyNodes?: boolean;
    maxCpuLoad?: number;
    maxMemoryUsage?: number;
    autoMovePlayers?: boolean;
    autoRebalance?: boolean;
}
```

## INodeStats

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface INodeStats {
    players: number;
    playingPlayers: number;
    uptime: number;
    memory: {
        free: number;
        used: number;
        allocated: number;
        reservable: number;
    };
    cpu: {
        cores: number;
        systemLoad: number;
        lavalinkLoad: number;
    };
}
```

## InspectorEvent

[Source declaration](../src/logging/AuroraInspector.ts)

```ts
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
```

## InspectorPlayer

[Source declaration](../src/logging/AuroraInspector.ts)

```ts
export interface InspectorPlayer {
    alias: string;
    state: 'playing' | 'paused' | 'idle' | 'unknown';
    backend: 'lavalink' | 'nodelink' | 'unknown';
}
```

## InspectorSnapshot

[Source declaration](../src/logging/AuroraInspector.ts)

```ts
export interface InspectorSnapshot {
    source: 'live' | 'simulated';
    nodes: CapabilityNode[];
    players: InspectorPlayer[];
    events: InspectorEvent[];
    spans: InspectorSpan[];
}
```

## InspectorSpan

[Source declaration](../src/logging/AuroraInspector.ts)

```ts
export interface InspectorSpan {
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    durationMs: number;
    startTimeMs?: number;
    outcome: 'ok' | 'error' | 'unset';
}
```

## IpBlockType

[Source declaration](../src/typings/Interfaces.ts)

```ts
export type IpBlockType = "Inet4Address" | "Inet6Address";
```

## IPhaser

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IPhaser {
    stages?: number;
    rate?: number;
    depth?: number;
    feedback?: number;
    mix?: number;
    minFrequency?: number;
    maxFrequency?: number;
}
```

## IPlayerConfig

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IPlayerConfig {
    guildId: string;
    voiceChannelId: string;
    textChannelId?: string;
    node?: string;
    nodeSelection?: NodeRequirements;
    volume?: number;
    selfDeaf?: boolean;
    selfMute?: boolean;
    autoPlay?: boolean;
    autoLeave?: boolean;
    loop?: "off" | "track" | "queue";
    loopCount?: number;
    current?: TrackSnapshot | {
        encoded: string;
        requester: any;
        position?: number;
    };
    queue?: Array<TrackSnapshot | {
        encoded: string;
        requester: any;
    }>;
    previous?: Array<TrackSnapshot | {
        encoded: string;
        requester: any;
    }>;
}
```

## IPlayerDestructionOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IPlayerDestructionOptions {
    autoDestroyOnIdle?: boolean;
    idleTimeout?: number;
}
```

## IPlayerHealthOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IPlayerHealthOptions {
    checkInterval?: number;
    silenceTimeout?: number;
    maxStuckCount?: number;
    maxSilentCount?: number;
    autoRecover?: boolean;
    resumeDebounce?: number;
}
```

## IPlayerState

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IPlayerState {
    time: number;
    position: number;
    connected: boolean;
    ping: number;
}
```

## IQueueOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IQueueOptions {
    maxSize?: number | "unlimited";
    allowDuplicates?: boolean;
    historyLimit?: number;
}
```

## IRESTGetLyrics

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IRESTGetLyrics {
    text?: string;
    lines?: Array<{
        timestamp: number;
        text: string;
    }>;
}
```

## IRESTGetPlayers

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IRESTGetPlayers {
    guildId: string;
    track?: ITrack;
    volume: number;
    paused: boolean;
    state: {
        time: number;
        position: number;
        connected: boolean;
        ping: number;
    };
    filters: any;
    voice: {
        token: string;
        endpoint: string;
        sessionId: string;
        connected?: boolean;
        ping?: number;
    };
}
```

## IRESTLoadTracks

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IRESTLoadTracks {
    loadType: string;
    data: any;
}
```

## IRESTOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IRESTOptions {
    guildId: string;
    data: any;
}
```

## IRotation

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IRotation {
    rotationHz?: number;
}
```

## IRoutePlannerDetails

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IRoutePlannerDetails {
    ipBlock: IIpBlock;
    failingAddresses: IFailingAddress[];
    rotateIndex?: string;
    ipIndex?: string;
    currentAddress?: string;
    currentAddressIndex?: string;
    blockIndex?: string;
}
```

## IRoutePlannerStatus

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IRoutePlannerStatus {
    class?: RoutePlannerType;
    details?: IRoutePlannerDetails;
}
```

## ISearchOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ISearchOptions {
    deduplicate?: boolean;
    trackResolution?: import('../tracks/MetadataTrackResolver').MetadataResolutionOptions;
    sourceHealth?: boolean;
    timeoutMs?: number;
    fallbackPlatforms?: string[];
    cache?: {
        ttlMs: number;
        maxEntries?: number;
    };
    resolver?: (query: ISearchQuery, node: Node) => Promise<IRESTLoadTracks | null>;
    defaultPlatform?: "youtube" | "youtubemusic" | "soundcloud" | "local";
    resultLimit?: number;
    playlistLoadLimit?: number;
}
```

## ISearchQuery

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ISearchQuery {
    signal?: AbortSignal;
    query: string;
    source?: string;
    requester?: any;
    node?: string;
}
```

## ISourceOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ISourceOptions {
    disabledSources?: string[];
}
```

## ISpatial

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ISpatial {
    depth?: number;
    rate?: number;
}
```

## ISpotifyOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ISpotifyOptions {
    enabled?: boolean;
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
    accessTokenExpiresAt?: number;
    market?: string;
    limitLoadSearch?: number;
    limitLoadPlaylist?: number;
    limitLoadAlbum?: number;
    limitLoadArtist?: number;
    limitLoadPlaylistPage?: number;
    limitLoadAlbumPage?: number;
    limitLoadRecommendations?: number;
}
```

## ITimescale

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ITimescale {
    speed?: number;
    pitch?: number;
    rate?: number;
}
```

## ITrack

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ITrack {
    backend?: BackendKind;
    encoded: string;
    info: ITrackInfo;
    pluginInfo: Record<string, any>;
    userData: Record<string, any>;
}
```

## ITrackHandlingOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ITrackHandlingOptions {
    autoSkipOnError?: boolean;
    skipStuckTracks?: boolean;
    trackStuckThreshold?: number;
    retryFailedTracks?: boolean;
    maxRetryAttempts?: number;
}
```

## ITrackInfo

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ITrackInfo {
    title: string;
    author: string;
    length: number;
    identifier: string;
    isSeekable: boolean;
    isStream: boolean;
    uri: string | null;
    artworkUrl?: string | null;
    isrc?: string | null;
    sourceName: string;
    position: number;
}
```

## ITremolo

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface ITremolo {
    frequency?: number;
    depth?: number;
}
```

## IVibrato

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IVibrato {
    frequency?: number;
    depth?: number;
}
```

## IVoiceConnectionOptions

[Source declaration](../src/typings/Interfaces.ts)

```ts
export interface IVoiceConnectionOptions {
    timeout?: number;
    maxReconnectAttempts?: number;
    reconnectDelay?: number;
    autoReconnect?: boolean;
}
```

## LavaDSPXEchoFilter

[Source declaration](../src/backends/LavaDSPXContracts.ts)

```ts
export interface LavaDSPXEchoFilter {
    echoLength: number;
    decay: number;
}
```

## LavaDSPXFilters

[Source declaration](../src/backends/LavaDSPXContracts.ts)

```ts
export interface LavaDSPXFilters {
    'high-pass'?: LavaDSPXPassFilter;
    'low-pass'?: LavaDSPXPassFilter;
    echo?: LavaDSPXEchoFilter;
    normalization?: LavaDSPXNormalizationFilter;
}
```

## LavaDSPXKey

[Source declaration](../src/backends/LavaDSPXContracts.ts)

```ts
export type LavaDSPXKey = typeof lavaDSPXKeys[number];
```

## LavaDSPXNormalizationFilter

[Source declaration](../src/backends/LavaDSPXContracts.ts)

```ts
export interface LavaDSPXNormalizationFilter {
    maxAmplitude: number;
    adaptive?: boolean;
}
```

## LavaDSPXPassFilter

[Source declaration](../src/backends/LavaDSPXContracts.ts)

```ts
export interface LavaDSPXPassFilter {
    cutoffFrequency: number;
    boostFactor?: number;
}
```

## LavalinkAdapter

[Source declaration](../src/backends/LavalinkAdapter.ts)

```ts
export declare class LavalinkAdapter extends BackendAdapter {
    readonly kind: "lavalink";
    constructor(version: string, capabilities: Set<string>, plugins?: readonly BackendPlugin[]);
}
```

## lavalinkSponsorBlockCategories

[Source declaration](../src/backends/LavalinkSponsorBlockContracts.ts)

```ts
export declare const lavalinkSponsorBlockCategories: readonly [
    "sponsor",
    "selfpromo",
    "interaction",
    "intro",
    "outro",
    "preview",
    "music_offtopic",
    "filler"
];
```

## LavalinkSponsorBlockCategory

[Source declaration](../src/backends/LavalinkSponsorBlockContracts.ts)

```ts
export type LavalinkSponsorBlockCategory = typeof lavalinkSponsorBlockCategories[number];
```

## LavalinkYoutubeAdminOptions

[Source declaration](../src/backends/LavalinkYoutubeContracts.ts)

```ts
export interface LavalinkYoutubeAdminOptions {
    allowSensitive: true;
    allowLoopbackHttp?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
}
```

## LavalinkYoutubeConfig

[Source declaration](../src/backends/LavalinkYoutubeContracts.ts)

```ts
export interface LavalinkYoutubeConfig {
    refreshToken: string | null;
}
```

## LavalinkYoutubeConfigUpdate

[Source declaration](../src/backends/LavalinkYoutubeContracts.ts)

```ts
export interface LavalinkYoutubeConfigUpdate {
    refreshToken?: string | null;
    skipInitialization?: boolean;
    poToken?: string | null;
    visitorData?: string | null;
}
```

## LavalinkYoutubeOAuthToken

[Source declaration](../src/backends/LavalinkYoutubeContracts.ts)

```ts
export interface LavalinkYoutubeOAuthToken {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
}
```

## LavalinkYoutubeStream

[Source declaration](../src/backends/LavalinkYoutubeContracts.ts)

```ts
export interface LavalinkYoutubeStream {
    stream: NodeJS.ReadableStream;
    statusCode: number;
    headers: import('node:http').IncomingHttpHeaders;
}
```

## LavalinkYoutubeStreamOptions

[Source declaration](../src/backends/LavalinkYoutubeContracts.ts)

```ts
export interface LavalinkYoutubeStreamOptions {
    itag?: number;
    withClient?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
}
```

## LavaLyricsData

[Source declaration](../src/backends/LavaLyricsContracts.ts)

```ts
export interface LavaLyricsData {
    sourceName: string;
    provider: string;
    text: string | null;
    lines: LavaLyricsLine[];
    plugin: Record<string, unknown>;
}
```

## LavaLyricsLine

[Source declaration](../src/backends/LavaLyricsContracts.ts)

```ts
export interface LavaLyricsLine {
    timestamp: number;
    duration: number | null;
    line: string;
    plugin: Record<string, unknown>;
}
```

## LavaLyricsObservation

[Source declaration](../src/backends/LavaLyricsContracts.ts)

```ts
export type LavaLyricsObservation = {
    guildId: string;
    kind: 'notFound';
} | {
    guildId: string;
    kind: 'found';
    lyrics: LavaLyricsData;
} | {
    guildId: string;
    kind: 'line';
    lineIndex: number;
    line: LavaLyricsLine;
    skipped: boolean;
};
```

## LavaLyricsOptions

[Source declaration](../src/backends/LavaLyricsContracts.ts)

```ts
export interface LavaLyricsOptions {
    skipTrackSource?: boolean;
}
```

## LavaSearchCollection

[Source declaration](../src/backends/LavaSearchContracts.ts)

```ts
export interface LavaSearchCollection {
    info: {
        name: string;
        selectedTrack: number;
    };
    pluginInfo: Record<string, unknown>;
    tracks: ITrack[];
}
```

## LavaSearchOptions

[Source declaration](../src/backends/LavaSearchContracts.ts)

```ts
export interface LavaSearchOptions {
    types?: readonly LavaSearchType[];
    signal?: AbortSignal;
    timeoutMs?: number;
}
```

## LavaSearchResult

[Source declaration](../src/backends/LavaSearchContracts.ts)

```ts
export interface LavaSearchResult {
    tracks?: ITrack[];
    albums?: LavaSearchCollection[];
    artists?: LavaSearchCollection[];
    playlists?: LavaSearchCollection[];
    texts?: LavaSearchText[];
    plugin: Record<string, unknown>;
}
```

## LavaSearchText

[Source declaration](../src/backends/LavaSearchContracts.ts)

```ts
export interface LavaSearchText {
    text: string;
    plugin: Record<string, unknown>;
}
```

## LavaSearchType

[Source declaration](../src/backends/LavaSearchContracts.ts)

```ts
export type LavaSearchType = typeof lavaSearchTypes[number];
```

## lavaSearchTypes

[Source declaration](../src/backends/LavaSearchContracts.ts)

```ts
export declare const lavaSearchTypes: readonly [
    "track",
    "album",
    "artist",
    "playlist",
    "text"
];
```

## LavaSrcPlaylistMetadata

[Source declaration](../src/backends/LavaSrcMetadata.ts)

```ts
export interface LavaSrcPlaylistMetadata {
    type?: LavaSrcPlaylistType;
    url?: string | null;
    artworkUrl?: string | null;
    author?: string | null;
    totalTracks?: number | null;
}
```

## LavaSrcPlaylistType

[Source declaration](../src/backends/LavaSrcMetadata.ts)

```ts
export type LavaSrcPlaylistType = 'album' | 'playlist' | 'artist' | 'recommendations';
```

## LavaSrcTrackMetadata

[Source declaration](../src/backends/LavaSrcMetadata.ts)

```ts
export interface LavaSrcTrackMetadata {
    albumName?: string | null;
    albumArtUrl?: string | null;
    artistUrl?: string | null;
    artistArtworkUrl?: string | null;
    previewUrl?: string | null;
    isPreview?: boolean;
}
```

## LoadType

[Source declaration](../src/typings/types.ts)

```ts
export declare enum LoadType {
    TRACK = "track",
    PLAYLIST = "playlist",
    SEARCH = "search",
    EMPTY = "empty",
    ERROR = "error"
}
```

## Local

[Source declaration](../src/database/Local.ts)

```ts
export declare class Local extends Memory {
    init(manager: Manager, options?: {
        path?: string;
    }): Promise<void>;
    set<T>(key: string, value: T, log?: boolean): Promise<void>;
    compareAndSet<T>(key: string, expectedRevision: string | null, value: T | undefined): Promise<boolean>;
    remove(key: string, log?: boolean): Promise<boolean>;
    clear(): Promise<void>;
    get<T>(key: string): Promise<T | undefined>;
    keys(pattern?: string): Promise<string[]>;
    has(key: string): Promise<boolean>;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
}
```

## LyricsKtLine

[Source declaration](../src/backends/LyricsKtContracts.ts)

```ts
export interface LyricsKtLine {
    line: string;
    range: {
        start: number;
        end: number;
    } | null;
}
```

## LyricsKtOptions

[Source declaration](../src/backends/LyricsKtContracts.ts)

```ts
export interface LyricsKtOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
}
```

## LyricsKtResult

[Source declaration](../src/backends/LyricsKtContracts.ts)

```ts
export type LyricsKtResult = {
    type: 'text';
    track: LyricsKtTrack;
    source: string;
    text: string;
} | {
    type: 'timed';
    track: LyricsKtTrack;
    source: string;
    lines: LyricsKtLine[];
};
```

## LyricsKtSearchTrack

[Source declaration](../src/backends/LyricsKtContracts.ts)

```ts
export interface LyricsKtSearchTrack {
    videoId: string;
    title: string;
}
```

## LyricsKtTrack

[Source declaration](../src/backends/LyricsKtContracts.ts)

```ts
export interface LyricsKtTrack {
    title: string;
    author: string;
    album: string | null;
    albumArt: Array<{
        url: string;
        height: number;
        width: number;
    }>;
}
```

## LyricsRequestOptions

[Source declaration](../src/backends/NodeLinkContracts.ts)

```ts
export type LyricsRequestOptions = {
    lang?: string;
    source?: string;
    type?: 'lyrics' | 'onlyCaptions';
};
```

## Manager

[Source declaration](../src/core/Manager.ts)

```ts
export declare class Manager extends EventEmitter<IManagerEvents> {
    initialized: boolean;
    readonly options: IManagerOptionsConfig;
    send: (guildId: string, payload: any) => void;
    clientId: string;
    readonly nodes: NodeManager;
    readonly pluginRoutes: BackendPluginRouteRegistry;
    readonly players: PlayerManager;
    guildOwnership?: GuildOwnership;
    get database(): DatabaseManager;
    set database(database: DatabaseManager);
    readonly aurora?: AuroraEvents;
    performanceMonitor?: PerformanceMonitor;
    get destroyed(): boolean;
    get readyNodes(): import("../..").Node[];
    get hasReadyNodes(): boolean;
    constructor(config: IManagerConfig);
    useGuildLeases(options: GuildOwnershipOptions): this;
    startPrivateMetricsServer(options: PrivateMetricsOptions): Promise<PrivateMetricsServer>;
    detachLogger(): void;
    startPerformanceMonitor(options?: PerformanceMonitorOptions): PerformanceMonitor;
    useExtension(extension: NyxExtension, options?: ExtensionOptions): Promise<() => Promise<void>>;
    removeExtension(name: string): Promise<boolean>;
    use(connector: Connector, client: any): this;
    init(clientId: string): Promise<this>;
    shutdown(): Promise<void>;
    search(options: ISearchQuery): Promise<SearchResult>;
    packetUpdate(packet: DiscordGatewayPacket): Promise<void>;
    decodeTrack(encoded: string): ITrack;
    encodeTrack(track: ITrackInfo): string;
}
```

## Memory

[Source declaration](../src/database/Memory.ts)

```ts
export declare class Memory implements StorageAdapter {
    protected store: Record<string, any>;
    init(_manager: Manager, _options?: any): Promise<void>;
    protected parts(key: string): string[];
    protected read<T>(key: string): T | undefined;
    get<T>(key: string): Promise<T | undefined>;
    compareAndSet<T>(key: string, expectedRevision: string | null, value: T | undefined): Promise<boolean>;
    set<T>(key: string, value: T): Promise<void>;
    protected storeValue<T>(key: string, value: T): void;
    has(key: string): Promise<boolean>;
    remove(key: string): Promise<boolean>;
    protected removeValue(key: string): boolean;
    keys(pattern?: string): Promise<string[]>;
    clear(): Promise<void>;
    shutdown(): Promise<void>;
}
```

## MetadataResolutionOptions

[Source declaration](../src/tracks/MetadataTrackResolver.ts)

```ts
export interface MetadataResolutionOptions {
    sources: readonly ('youtube' | 'youtubemusic' | 'soundcloud')[];
    minimumScore?: number;
    durationToleranceMs?: number;
    maxCandidates?: number;
    timeoutMs?: number;
}
```

## MigrationStage

[Source declaration](../src/players/PlayerMigration.ts)

```ts
export type MigrationStage = 'select-target' | 'resolve-track' | 'restore-player' | 'persist-snapshot' | 'cleanup-source' | 'rollback' | 'cleanup-target';
```

## MigrationStageObservation

[Source declaration](../src/players/PlayerMigration.ts)

```ts
export interface MigrationStageObservation {
    migrationId: string;
    guildId: string;
    source: string;
    target: string;
    stage: MigrationStage;
    status: 'started' | 'acknowledged' | 'failed' | 'cancelled' | 'partial';
    elapsedMs: number;
}
```

## MixCreateOptions

[Source declaration](../src/backends/NodeLinkMixContracts.ts)

```ts
export interface MixCreateOptions {
    volume?: number;
    userData?: Record<string, unknown>;
}
```

## MixLayerCreated

[Source declaration](../src/backends/NodeLinkMixContracts.ts)

```ts
export interface MixLayerCreated {
    id: string;
    track: ITrack;
    volume: number;
}
```

## MixLayersResponse

[Source declaration](../src/backends/NodeLinkMixContracts.ts)

```ts
export interface MixLayersResponse {
    mixes: MixLayerState[];
}
```

## MixLayerState

[Source declaration](../src/backends/NodeLinkMixContracts.ts)

```ts
export interface MixLayerState extends MixLayerCreated {
    position: number;
    startTime: number;
}
```

## MixRecoveryOptions

[Source declaration](../src/players/MixRecovery.ts)

```ts
export interface MixRecoveryOptions {
    mode: 'restart';
    maxLayers?: number;
}
```

## MixRecoveryReport

[Source declaration](../src/players/MixRecovery.ts)

```ts
export interface MixRecoveryReport {
    status: 'unavailable' | 'skipped' | 'completed' | 'partial';
    captured: number;
    restored: readonly {
        sourceId: string;
        targetId: string;
    }[];
    failed: number;
    skipped: number;
}
```

## MusicSnapshot

[Source declaration](../src/logging/AuroraDiagnostics.ts)

```ts
export interface MusicSnapshot {
    state: 'playing' | 'paused' | 'idle' | 'ended' | 'unknown';
    positionMs?: number;
    durationMs?: number;
    stream: boolean;
    estimated: boolean;
    crossfadeConfigured: boolean;
}
```

## Node

[Source declaration](../src/entities/Node.ts)

```ts
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
    readonly sourceHealth: SourceHealthMonitor;
    backendRefreshedAt?: number;
    url: string;
    rest: Rest;
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
    loadNodeLinkSearch(query: string, options?: NodeLinkDiscoveryOptions): Promise<IRESTLoadTracks>;
    loadSearch(query: string, options?: LavaSearchOptions): Promise<LavaSearchResult | null>;
    getLavaLyrics(track: string | ITrack | Track | {
        encoded?: string;
    }, options?: LavaLyricsOptions): Promise<LavaLyricsData | null>;
    loadLyrics(track: string | ITrack | Track | {
        encoded?: string;
    }, options?: string | LyricsRequestOptions): Promise<NodeLinkResponse<ILyricsData | Record<string, any>> | null>;
    loadMedia(lookup: NodeLinkMediaLookup): Promise<NodeLinkMediaLookupResult>;
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
    connect(): Promise<void>;
    probe(): Promise<boolean>;
    reconnect(): void;
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
    cancelVoiceReconnect(player: Player): void;
    updateRecommendations(player: any, track?: Track): Promise<void>;
    handleAutoPlay(player: any, previousTrack: any): Promise<boolean>;
    protected error({ error }: {
        error: unknown;
    }): void;
    destroy(): Promise<void>;
}
```

## NodeCircuitBreaker

[Source declaration](../src/nodes/NodeCircuitBreaker.ts)

```ts
export declare class NodeCircuitBreaker {
    readonly enabled: boolean;
    constructor(options?: CircuitBreakerOptions | false);
    get state(): CircuitState;
    get retryAt(): number;
    run<T>(operation: () => Promise<T>): Promise<T>;
}
```

## NodeFailover

[Source declaration](../src/nodes/NodeFailover.ts)

```ts
export declare class NodeFailover {
    static move(player: Player, source: Node, options?: FailoverOptions): Promise<FailoverResult>;
}
```

## NodeHealth

[Source declaration](../src/nodes/NodeHealthMonitor.ts)

```ts
export type NodeHealth = {
    state: 'healthy' | 'unhealthy' | 'unknown' | 'unavailable' | 'draining';
    reason: string;
    cpuPercent?: number;
    memoryPercent?: number;
};
```

## NodeHealthMonitor

[Source declaration](../src/nodes/NodeHealthMonitor.ts)

```ts
export declare class NodeHealthMonitor {
    static available(node: Node): boolean;
    static inspect(node: Node, options?: INodeOptions, now?: number): NodeHealth;
}
```

## NodeLinkAdapter

[Source declaration](../src/backends/NodeLinkAdapter.ts)

```ts
export declare class NodeLinkAdapter extends BackendAdapter {
    readonly kind: "nodelink";
    constructor(version: string, capabilities: Set<string>, plugins?: readonly BackendPlugin[]);
}
```

## NodeLinkAdminOptions

[Source declaration](../src/backends/NodeLinkAdminContracts.ts)

```ts
export interface NodeLinkAdminOptions {
    allowSensitive: true;
    allowLoopbackHttp?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
}
```

## NodeLinkAudioProcessingSnapshot

[Source declaration](../src/backends/NodeLinkPlayerTelemetry.ts)

```ts
export interface NodeLinkAudioProcessingSnapshot {
    requested_gain: number;
    applied_gain: number;
    average_applied_gain: number;
    max_gain_reduction_db: number;
    average_gain_reduction_db: number;
    average_gain_reduction_active_db: number;
    limiter_active_duration_ms: number;
}
```

## NodeLinkDiscoveryOptions

[Source declaration](../src/backends/NodeLinkSearchContracts.ts)

```ts
export interface NodeLinkDiscoveryOptions {
    source?: string;
    type?: NodeLinkDiscoveryType;
    timeoutMs?: number;
    signal?: AbortSignal;
}
```

## NodeLinkDiscoveryType

[Source declaration](../src/backends/NodeLinkSearchContracts.ts)

```ts
export type NodeLinkDiscoveryType = typeof nodeLinkDiscoveryTypes[number];
```

## nodeLinkDiscoveryTypes

[Source declaration](../src/backends/NodeLinkSearchContracts.ts)

```ts
export declare const nodeLinkDiscoveryTypes: readonly [
    "track",
    "album",
    "artist",
    "playlist",
    "channel",
    "user"
];
```

## NodeLinkHlsManifest

[Source declaration](../src/backends/NodeLinkHlsContracts.ts)

```ts
export interface NodeLinkHlsManifest {
    sessionId: string;
    playlist: string;
}
```

## NodeLinkHlsOptions

[Source declaration](../src/backends/NodeLinkHlsContracts.ts)

```ts
export interface NodeLinkHlsOptions {
    volume?: number;
    segmentDuration?: number;
    filters?: Record<string, unknown>;
    signal?: AbortSignal;
    timeoutMs?: number;
}
```

## NodeLinkHlsReadOptions

[Source declaration](../src/backends/NodeLinkHlsContracts.ts)

```ts
export interface NodeLinkHlsReadOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}
```

## NodeLinkLyricAnnotation

[Source declaration](../src/backends/NodeLinkLyricsEvents.ts)

```ts
export interface NodeLinkLyricAnnotation {
    kind?: 'lyric' | 'instrumental';
    section?: string;
    agent?: string;
    isBackground?: boolean;
    alternatives?: Array<{
        kind: 'translation' | 'romanization';
        text: string;
        language?: string;
    }>;
}
```

## NodeLinkLyricsObservation

[Source declaration](../src/backends/NodeLinkLyricsEvents.ts)

```ts
export type NodeLinkLyricsObservation = {
    guildId: string;
    kind: 'notFound';
} | {
    guildId: string;
    kind: 'found';
    lyrics: {
        sourceName?: string;
        provider?: string;
        synced?: boolean;
        text: string;
        lines: NodeLinkPlaybackLyricLine[];
    };
} | {
    guildId: string;
    kind: 'line';
    lineIndex: number;
    line: NodeLinkPlaybackLyricLine;
    skipped?: boolean;
    activeLineIndices?: number[];
};
```

## NodeLinkLyricWord

[Source declaration](../src/backends/NodeLinkLyricsEvents.ts)

```ts
export interface NodeLinkLyricWord {
    text: string;
    timestamp?: number;
    time?: number;
    duration?: number;
}
```

## NodeLinkMediaArtist

[Source declaration](../src/backends/NodeLinkMediaMetadata.ts)

```ts
export interface NodeLinkMediaArtist {
    name: string;
    id?: string;
    url?: string;
    artwork?: NodeLinkMediaImage[];
    banners?: NodeLinkMediaImage[];
    biography?: {
        text: string;
        source?: string;
        summary?: string;
    };
}
```

## NodeLinkMediaCredit

[Source declaration](../src/backends/NodeLinkMediaLookup.ts)

```ts
export interface NodeLinkMediaCredit {
    mbid: string;
    name: string;
    role: string;
}
```

## NodeLinkMediaImage

[Source declaration](../src/backends/NodeLinkMediaMetadata.ts)

```ts
export interface NodeLinkMediaImage {
    url: string;
    width?: number;
    height?: number;
}
```

## NodeLinkMediaLookup

[Source declaration](../src/backends/NodeLinkMediaLookup.ts)

```ts
export type NodeLinkMediaLookup = {
    isrc: string;
} | {
    recordingMbid: string;
} | {
    workMbid: string;
} | {
    artistMbid: string;
} | {
    releaseGroupMbid: string;
};
```

## NodeLinkMediaLookupResult

[Source declaration](../src/backends/NodeLinkMediaLookup.ts)

```ts
export type NodeLinkMediaLookupResult = {
    provider: 'musicbrainz';
    isrc: string;
    recordings: NodeLinkMediaRecording[];
} | (NodeLinkMediaRecording & {
    provider: 'musicbrainz';
    isrcs: string[];
}) | {
    provider: 'musicbrainz';
    mbid: string;
    title?: string;
    credits: NodeLinkMediaCredit[];
    workMbids: string[];
} | {
    provider: 'fanart.tv';
    mbid: string;
    name?: string;
    artwork: NodeLinkMediaImage[];
    banners: NodeLinkMediaImage[];
    backgrounds: NodeLinkMediaImage[];
    logos: NodeLinkMediaImage[];
} | {
    provider: 'fanart.tv';
    releaseGroupMbid: string;
    artistName?: string;
    artwork: NodeLinkMediaImage[];
    discArtwork: NodeLinkMediaImage[];
};
```

## NodeLinkMediaMetadata

[Source declaration](../src/backends/NodeLinkMediaMetadata.ts)

```ts
export interface NodeLinkMediaMetadata {
    provider: string;
    artists: NodeLinkMediaArtist[];
    album?: {
        name?: string;
        id?: string;
        artwork?: NodeLinkMediaImage[];
        url?: string;
        releaseDate?: string;
        copyright?: string;
        label?: string;
        type?: string;
        trackCount?: number;
        discCount?: number;
    };
    artwork?: NodeLinkMediaImage[];
    canvas?: {
        url: string;
        id?: string;
        uri?: string;
        fileId?: string;
        type?: string;
    };
    motionArtwork?: {
        url: string;
        scope?: 'track' | 'album';
        variants?: Array<NodeLinkMediaImage & {
            aspectRatio: '1:1' | '3:4' | '9:16';
        }>;
    };
    identifiers?: {
        isrc?: string;
        upc?: string;
        ean?: string;
    };
    credits?: Array<{
        name: string;
        role: string;
    }>;
    colors?: {
        dark?: string;
        light?: string;
        raw?: string;
        palette?: Record<string, unknown>;
    };
    catalog?: Record<string, unknown>;
    channel?: {
        name?: string;
        id?: string;
        artwork?: NodeLinkMediaImage[];
        banners?: NodeLinkMediaImage[];
    };
}
```

## NodeLinkMediaRecording

[Source declaration](../src/backends/NodeLinkMediaLookup.ts)

```ts
export interface NodeLinkMediaRecording {
    mbid: string;
    title: string;
    artists: Array<{
        mbid: string;
        name: string;
    }>;
    durationMs?: number;
    credits: NodeLinkMediaCredit[];
    workMbids: string[];
    releaseGroups: Array<{
        mbid: string;
        title: string;
        firstReleaseDate?: string;
        type?: string;
    }>;
}
```

## NodeLinkMusicAnalysisSnapshot

[Source declaration](../src/backends/NodeLinkPlayerTelemetry.ts)

```ts
export interface NodeLinkMusicAnalysisSnapshot {
    scope: 'processed-output';
    capturedAt: number;
    outputWindowStartMs: number;
    outputWindowEndMs: number;
    analyzedMs: number;
    bpm: number | null;
    bpmConfidence: number;
    key: string | null;
    keyConfidence: number;
    energy: number;
    estimatedLoudnessLufs: number;
    peak: number;
    bands: {
        low: number;
        mid: number;
        high: number;
    };
    vocalActivityEstimate: number;
    brightness: number;
    beatPositionsMs: number[];
    onsetPositionsMs: number[];
    silenceRatio: number;
}
```

## NodeLinkPlaybackLyricLine

[Source declaration](../src/backends/NodeLinkLyricsEvents.ts)

```ts
export interface NodeLinkPlaybackLyricLine {
    timestamp: number;
    duration: number;
    line: string;
    words: NodeLinkLyricWord[];
    plugin: NodeLinkLyricAnnotation;
}
```

## NodeLinkPlayerTelemetry

[Source declaration](../src/backends/NodeLinkPlayerTelemetry.ts)

```ts
export interface NodeLinkPlayerTelemetry {
    visualization?: NodeLinkVisualizationSnapshot;
    musicAnalysis?: NodeLinkMusicAnalysisSnapshot;
    audioProcessing?: NodeLinkAudioProcessingSnapshot;
}
```

## NodeLinkPlayerUpdate

[Source declaration](../src/backends/ProtocolContracts.ts)

```ts
export interface NodeLinkPlayerUpdate extends CommonPlayerUpdate {
    track?: PlayerTrackUpdate & {
        audioTrackId?: string;
    };
    nextTrack?: {
        encoded: string;
        userData?: Record<string, unknown>;
    } | null;
    fading?: IFadingOptions;
    crossfade?: CrossfadeOptions;
    loudnessNormalizer?: boolean;
}
```

## NodeLinkProcessMemory

[Source declaration](../src/backends/NodeLinkDiagnostics.ts)

```ts
export interface NodeLinkProcessMemory {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers?: number;
}
```

## NodeLinkProfilerOptions

[Source declaration](../src/backends/NodeLinkDiagnostics.ts)

```ts
export interface NodeLinkProfilerOptions {
    code: string;
    scope?: NodeLinkProfilerScope;
    allowLoopbackHttp?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
}
```

## NodeLinkProfilerProcess

[Source declaration](../src/backends/NodeLinkDiagnostics.ts)

```ts
export interface NodeLinkProfilerProcess {
    success: boolean;
    pid?: number;
    clusterId?: number;
    uniqueId?: number;
    memory?: NodeLinkProcessMemory;
    cpuProfiling?: boolean;
    heapSamplingActive?: boolean;
    uptimeSec?: number;
}
```

## NodeLinkProfilerScope

[Source declaration](../src/backends/NodeLinkDiagnostics.ts)

```ts
export type NodeLinkProfilerScope = 'all' | 'master' | 'workers' | 'sourceWorkers';
```

## NodeLinkProfilerSnapshot

[Source declaration](../src/backends/NodeLinkDiagnostics.ts)

```ts
export interface NodeLinkProfilerSnapshot {
    action: 'status';
    scope: NodeLinkProfilerScope;
    timestamp: number;
    master?: NodeLinkProfilerProcess;
    workers?: NodeLinkProfilerProcess[];
    sourceWorkers?: NodeLinkProfilerProcess[];
    workersUnavailable?: boolean;
    sourceWorkersUnavailable?: boolean;
}
```

## NodeLinkVisualizationSnapshot

[Source declaration](../src/backends/NodeLinkPlayerTelemetry.ts)

```ts
export interface NodeLinkVisualizationSnapshot {
    capturedAt: number;
    outputFrame: number;
    sampleRate: number;
    rms: [
        number,
        number
    ];
    peak: [
        number,
        number
    ];
    waveform: number[];
    spectrum: Array<{
        hz: number;
        magnitude: number;
    }>;
}
```

## NodeLinkWorkerSnapshot

[Source declaration](../src/backends/NodeLinkDiagnostics.ts)

```ts
export interface NodeLinkWorkerSnapshot {
    id: number;
    clusterId?: number;
    pid?: number;
    health?: boolean;
    uptime?: number;
    players?: number;
    playingPlayers?: number;
    commandQueueLength?: number;
    cpuLoad?: number;
    memoryUsed?: number;
    memoryAllocated?: number;
    eventLoopLag?: number;
    eventLoopLagP50?: number;
    eventLoopLagP95?: number;
    eventLoopLagP99?: number;
    stuckRecoveries?: number;
}
```

## NodeLinkWorkerTarget

[Source declaration](../src/backends/NodeLinkAdminContracts.ts)

```ts
export type NodeLinkWorkerTarget = {
    clusterId: number;
    id?: never;
    pid?: never;
} | {
    id: number;
    clusterId?: never;
    pid?: never;
} | {
    pid: number;
    id?: never;
    clusterId?: never;
};
```

## NodeLinkWorkerTermination

[Source declaration](../src/backends/NodeLinkAdminContracts.ts)

```ts
export interface NodeLinkWorkerTermination {
    killed: true;
    id: number;
    clusterId: number;
    pid: number | null;
}
```

## NodeLinkWorkerTerminationOptions

[Source declaration](../src/backends/NodeLinkAdminContracts.ts)

```ts
export interface NodeLinkWorkerTerminationOptions extends NodeLinkAdminOptions {
    confirm: true;
    code: string;
}
```

## NodeLinkYoutubeConfig

[Source declaration](../src/backends/NodeLinkAdminContracts.ts)

```ts
export interface NodeLinkYoutubeConfig {
    refreshToken: string | null;
    visitorData: string | null;
    isConfigured: boolean;
    isValid: boolean | null;
}
```

## NodeLinkYoutubeConfigAcknowledgement

[Source declaration](../src/backends/NodeLinkAdminContracts.ts)

```ts
export interface NodeLinkYoutubeConfigAcknowledgement {
    workersUpdated: number;
    fieldsUpdated: Array<'refreshToken' | 'visitorData'>;
}
```

## NodeLinkYoutubeConfigUpdate

[Source declaration](../src/backends/NodeLinkAdminContracts.ts)

```ts
export interface NodeLinkYoutubeConfigUpdate {
    refreshToken?: string;
    visitorData?: string;
}
```

## NodeManager

[Source declaration](../src/managers/NodeManager.ts)

```ts
export declare class NodeManager {
    readonly manager: Manager;
    readonly nodes: Map<string, Node>;
    constructor(manager: Manager, nodeConfigs: IManagerNodeConfig[]);
    init(): void;
    add(config: IManagerNodeConfig): void;
    remove(identifier: string): boolean;
    get onlineNodes(): Node[];
    get hasOnlineNodes(): boolean;
    get ready(): Node[];
    get hasReady(): boolean;
    get leastUsedNode(): Node | undefined;
    get stats(): Record<string, INodeStats>;
    getBackendInventory(): BackendInventoryEntry[];
    findNode(options?: NodeSelectionOptions): Node | undefined;
    setDraining(identifier: string, draining?: boolean): boolean;
    drain(identifier: string): Promise<boolean>;
    eject(identifier: string): Promise<boolean>;
}
```

## NodeRejection

[Source declaration](../src/nodes/NodeSelector.ts)

```ts
export type NodeRejection = {
    identifier: string;
    reasons: NodeRejectionReason[];
    missingCapabilities?: string[];
};
```

## NodeRejectionReason

[Source declaration](../src/nodes/NodeSelector.ts)

```ts
export type NodeRejectionReason = 'unavailable' | 'excluded' | 'not-ready' | 'not-found' | 'backend' | 'capability' | 'region' | 'unhealthy' | 'draining' | 'circuit-open';
```

## NodeRequirements

[Source declaration](../src/nodes/NodeSelector.ts)

```ts
export type NodeRequirements = {
    readonly backend?: BackendKind;
    readonly requiredCapabilities?: readonly string[];
    readonly region?: string;
    readonly regionPolicy?: 'prefer' | 'require';
};
```

## NodeScoreWeights

[Source declaration](../src/nodes/NodeScoring.ts)

```ts
export type NodeScoreWeights = Partial<Record<'players' | 'cpu' | 'memory' | 'latency' | 'priority', number>>;
```

## NodeSelectionOptions

[Source declaration](../src/nodes/NodeSelector.ts)

```ts
export type NodeSelectionOptions = NodeRequirements & {
    scoreWeights?: NodeScoreWeights;
    preferredNode?: string;
    minimumScoreImprovement?: number;
    exclude?: readonly string[];
    allowUnhealthyFallback?: boolean;
    preferSource?: string;
    sourceHealthMaxAgeMs?: number;
};
```

## NodeSelector

[Source declaration](../src/nodes/NodeSelector.ts)

```ts
export declare class NodeSelector {
    static validate(selection?: NodeSelectionOptions): void;
    static matches(node: Node, requirements?: NodeRequirements): boolean;
    static rejections(nodes: Iterable<Node>, options?: INodeOptions, selection?: NodeSelectionOptions): NodeRejection[];
    static select(nodes: Iterable<Node>, options?: INodeOptions, selection?: NodeSelectionOptions): Node | undefined;
}
```

## NodeState

[Source declaration](../src/typings/types.ts)

```ts
export declare enum NodeState {
    CONNECTING = 0,
    CONNECTED = 1,
    DISCONNECTED = 2,
    DESTROYED = 3,
    READY = 4,
    RESUMING = 5
}
```

## NoEligibleNodeError

[Source declaration](../src/errors/NoEligibleNodeError.ts)

```ts
export declare class NoEligibleNodeError extends Error {
    readonly rejections: NodeRejection[];
    readonly code = "NO_ELIGIBLE_NODE";
    constructor(rejections: NodeRejection[]);
}
```

## normalizeAuroraEvent

[Source declaration](../src/logging/AuroraEvents.ts)

```ts
export declare function normalizeAuroraEvent(input: unknown): AuroraEvent | undefined;
```

## NyxExtension

[Source declaration](../src/extensions/ExtensionHost.ts)

```ts
export interface NyxExtension {
    readonly name: string;
    setup(context: ExtensionContext): void | Promise<void>;
    dispose?(): void | Promise<void>;
}
```

## OpenTelemetry

[Source declaration](../src/observability/OpenTelemetry.ts)

```ts
export declare class OpenTelemetry {
    constructor(manager: Manager, options: OpenTelemetryOptions);
    search(operation: () => Promise<SearchResult>): Promise<SearchResult>;
    operation<T>(name: TelemetryOperation, operation: () => Promise<T>, classify?: (result: T) => TelemetryOutcome): Promise<T>;
    syncOperation<T>(name: TelemetryOperation, operation: () => T, classify?: (result: T) => TelemetryOutcome): T;
    close(): void;
}
```

## OpenTelemetryOptions

[Source declaration](../src/observability/OpenTelemetry.ts)

```ts
export interface OpenTelemetryOptions {
    meter?: TelemetryMeter;
    tracer?: TelemetryTracer;
}
```

## PerformanceMetric

[Source declaration](../src/observability/PerformanceMonitor.ts)

```ts
export type PerformanceMetric = typeof metrics[number];
```

## PerformanceMonitor

[Source declaration](../src/observability/PerformanceMonitor.ts)

```ts
export declare class PerformanceMonitor {
    get running(): boolean;
    constructor(manager: Manager, options?: PerformanceMonitorOptions);
    start(): this;
    observe(metric: PerformanceMetric, durationMs: number): void;
    recordSearch(): void;
    measure<T>(metric: 'rest' | 'streamOpen', operation: () => Promise<T>): Promise<T>;
    snapshot(): PerformanceSnapshot;
    close(): void;
}
```

## PerformanceMonitorOptions

[Source declaration](../src/observability/PerformanceMonitor.ts)

```ts
export interface PerformanceMonitorOptions {
    sampleLimit?: number;
    eventLoopResolutionMs?: number;
    maxPendingMs?: number;
}
```

## PerformanceSnapshot

[Source declaration](../src/observability/PerformanceMonitor.ts)

```ts
export interface PerformanceSnapshot {
    active: boolean;
    durations: Record<PerformanceMetric, DurationSummary>;
    counters: {
        restErrors: number;
        streamOpenErrors: number;
        reconnects: number;
        recoveries: number;
        recoveryFailures: number;
        searches: number;
    };
    runtime: {
        uptimeSeconds: number;
        rssBytes: number;
        heapUsedBytes: number;
        eventLoopUtilization: number;
        eventLoopP50Ms?: number;
        eventLoopP95Ms?: number;
    };
    resources: {
        connectedNodes: number;
        pendingRequests: number;
        pendingPlayerCommands: number;
        managerListeners: number;
        activeTypes: Record<string, number>;
    };
}
```

## Player

[Source declaration](../src/entities/Player.ts)

```ts
export declare class Player {
    readonly manager: Manager;
    node: Node;
    readonly nodeSelection: NodeRequirements;
    readonly guildId: string;
    readonly queue: Queue;
    readonly filters: Filters;
    readonly voice: Voice;
    data: Record<string, unknown>;
    voiceChannelId: string;
    textChannelId: string;
    playing: boolean;
    paused: boolean;
    connected: boolean;
    destroyed: boolean;
    volume: number;
    loop: PlayerLoop;
    loopCount?: number;
    autoPlay: boolean;
    autoLeave: boolean;
    ping: number;
    isResuming: boolean;
    current: Track | null;
    previous: Track[];
    recommendations: Track[];
    historySize: number;
    lastActivityTime: number;
    get pendingCommands(): number;
    lastPosition: number;
    lastPositionTime: number;
    stuckDetectionCount: number;
    silentDetectionCount: number;
    constructor(manager: Manager, node: Node, config: IPlayerConfig);
    startHealthCheck(): void;
    stopHealthCheck(): void;
    softRestart(reason: string): Promise<boolean>;
    updateActivity(): void;
    set(key: string, value: unknown): this;
    get<T>(key: string): T | undefined;
    updateData<T>(path?: string, data?: T): Promise<void>;
    exportSnapshot(): Promise<PlayerSnapshot>;
    updatePlayer(payload: PlayerUpdatePayload, noReplace?: boolean): Promise<any>;
    updateVoice(voice: PlayerVoiceUpdate): Promise<any>;
    connect({ selfDeaf, selfMute }?: {
        selfDeaf?: boolean;
        selfMute?: boolean;
    }): Promise<this>;
    disconnect(): Promise<this>;
    play(options?: {
        track?: Track;
        encoded?: string;
        requester?: any;
        position?: number;
        noReplace?: boolean;
        audioTrackId?: string;
    } | Track): Promise<boolean>;
    playAutoPlay(track: Track, ticket: number, automaticTicket: number): Promise<boolean>;
    addMix(track: Track | string, options?: MixCreateOptions): Promise<MixLayerCreated | null>;
    getMixes(): Promise<MixLayersResponse | null>;
    updateMixVolume(mixId: string, volume: number): Promise<this>;
    removeMix(mixId: string): Promise<this>;
    subscribeLyrics(options?: {
        skipTrackSource?: boolean;
    }): Promise<this>;
    unsubscribeLyrics(): Promise<this>;
    loadChapters(encodedTrack?: string): Promise<NodeLinkResponse<IChapter[]> | null>;
    loadMeaning(encodedTrack?: string, lang?: string): Promise<NodeLinkResponse<IMeaningResponse | Record<string, any>> | null>;
    getLoadDirectStream(options?: {
        volume?: number;
        position?: number;
        filters?: IFilters | Record<string, any>;
    }): Promise<{
        stream: NodeJS.ReadableStream;
        headers: Record<string, any>;
    }>;
    getDirectStream(itag?: number | null): Promise<any | null>;
    setFading(fading: IFadingOptions): Promise<this>;
    clearFading(): Promise<this>;
    getCrossfade(): CrossfadeOptions | undefined;
    setCrossfade(options: CrossfadeOptions): Promise<this>;
    clearCrossfade(): Promise<this>;
    setNextTrack(track: Track | string, userData?: Record<string, any>): Promise<this>;
    clearNextTrack(): Promise<this>;
    getNextTrack(): {
        encoded: string;
        userData?: Record<string, unknown>;
    } | undefined;
    setQueuePreload(options: QueuePreloadOptions): this;
    requestQueuePreload(): void;
    completeAudioMigration(): boolean;
    consumePreloadedTrack(): void;
    setAudioTrackId(audioTrackId?: string): this;
    setLoudnessNormalizer(enabled: boolean): Promise<this>;
    createVoiceReceiver(options?: VoiceReceiverOptions): VoiceReceiver;
    pause(): Promise<this>;
    resume(options?: {
        timeout?: number;
    }): Promise<this>;
    forward(ms: number): Promise<this>;
    rewind(ms: number): Promise<this>;
    setVoiceState(state: {
        channelId?: string;
        selfMute?: boolean;
        selfDeaf?: boolean;
    }): Promise<this>;
    toggleMute(): Promise<this>;
    toggleDeaf(): Promise<this>;
    search(query: string, source?: string): Promise<any>;
    stop(): Promise<this>;
    skip(position?: number): Promise<boolean>;
    seek(position: number): Promise<this>;
    setVolume(volume: number): this;
    setVolumeAsync(volume: number): Promise<this>;
    setLoop(loop: PlayerLoop, count?: number): this;
    setAutoPlay(autoPlay: boolean): this;
    setAutoLeave(autoLeave: boolean): this;
    shuffle(): this;
    destroy(reason?: string): Promise<void>;
    restart(options?: RestartOptions): Promise<boolean>;
    transferNode(node: Node | string): Promise<boolean>;
    setVoiceChannelId(voiceChannelId: string): this;
    setTextChannelId(textChannelId: string): this;
    replay(): Promise<boolean>;
    back(): Promise<boolean>;
}
```

## PlayerGroup

[Source declaration](../src/backends/NodeLinkOrchestration.ts)

```ts
export interface PlayerGroup {
    id: string;
    guildIds: string[];
    createdAt: number;
}
```

## PlayerManager

[Source declaration](../src/managers/PlayerManager.ts)

```ts
export declare class PlayerManager {
    readonly manager: Manager;
    readonly players: Map<string, Player>;
    constructor(manager: Manager);
    get all(): Player[];
    create(options: IPlayerConfig): Player;
    createOwned(options: IPlayerConfig): Promise<Player>;
    restoreOwned(options: IPlayerConfig): Promise<Player>;
    restore(options: IPlayerConfig): Player;
    get(guildId: string): Player | undefined;
    has(guildId: string): boolean;
    get size(): number;
    get playingPlayers(): Player[];
    get idlePlayers(): Player[];
    filter(predicate: (player: Player) => boolean): Player[];
    find(predicate: (player: Player) => boolean): Player | undefined;
    map<T>(callback: (player: Player) => T): T[];
    forEach(callback: (player: Player) => void): void;
    clear(): Promise<void>;
    destroyAll(): Promise<void>;
    destroy(guildId: string, reason?: string): Promise<boolean>;
}
```

## PlayerOperationCancelledError

[Source declaration](../src/errors/PlayerOperationCancelledError.ts)

```ts
export declare class PlayerOperationCancelledError extends Error {
    readonly operation: string;
    readonly code = "PLAYER_OPERATION_CANCELLED";
    constructor(operation: string);
}
```

## PlayerSnapshot

[Source declaration](../src/database/PlayerSnapshot.ts)

```ts
export type PlayerSnapshot = {
    schemaVersion: 1;
    revision: string | null;
    data: PlayerSnapshotData;
};
```

## PlayerSnapshotCodec

[Source declaration](../src/database/PlayerSnapshot.ts)

```ts
export declare class PlayerSnapshotCodec {
    static fromRecord(record: unknown): PlayerSnapshot;
    static parse(input: unknown): PlayerSnapshot;
    static capture(player: Player, revision: string | null): PlayerSnapshot;
}
```

## PlayerSnapshotData

[Source declaration](../src/database/PlayerSnapshot.ts)

```ts
export type PlayerSnapshotData = Omit<IPlayerConfig, 'current' | 'queue' | 'previous'> & {
    current: TrackSnapshot | null;
    queue: TrackSnapshot[];
    previous: TrackSnapshot[];
    volume: number;
    playing: boolean;
    paused: boolean;
    autoPlay: boolean;
    autoLeave: boolean;
    loop: 'off' | 'track' | 'queue';
    filters?: Record<string, unknown>;
};
```

## PlayerTrackUpdate

[Source declaration](../src/backends/ProtocolContracts.ts)

```ts
export interface PlayerTrackUpdate {
    encoded?: string | null;
    identifier?: string;
    userData?: Record<string, unknown>;
}
```

## PlayerUpdateAcknowledgement

[Source declaration](../src/backends/ProtocolContracts.ts)

```ts
export type PlayerUpdateAcknowledgement = Record<string, unknown> & {
    guildId?: string;
    volume?: number;
    paused?: boolean;
    state?: {
        position: number;
    } & Record<string, unknown>;
    track?: {
        encoded: string | null;
        userData?: Record<string, unknown>;
    } & Record<string, unknown> | null;
};
```

## PlayerUpdatePayload

[Source declaration](../src/backends/ProtocolContracts.ts)

```ts
export type PlayerUpdatePayload = NodeLinkPlayerUpdate & Record<string, unknown>;
```

## PlayerVoiceUpdate

[Source declaration](../src/backends/ProtocolContracts.ts)

```ts
export interface PlayerVoiceUpdate {
    sessionId: string;
    token: string;
    endpoint: string;
    channelId?: string;
}
```

## PrivateMetricsNode

[Source declaration](../src/observability/PrivateMetricsServer.ts)

```ts
export interface PrivateMetricsNode {
    key: string;
    backend: string;
    state: string;
    ready: boolean;
    draining: boolean;
    players: number;
    playingPlayers: number;
}
```

## PrivateMetricsOptions

[Source declaration](../src/observability/PrivateMetricsServer.ts)

```ts
export interface PrivateMetricsOptions {
    token: string;
    host?: '127.0.0.1' | '::1';
    port?: number;
}
```

## PrivateMetricsServer

[Source declaration](../src/observability/PrivateMetricsServer.ts)

```ts
export declare class PrivateMetricsServer {
    constructor(manager: Manager, options: PrivateMetricsOptions);
    get url(): string;
    listen(): Promise<this>;
    close(): Promise<void>;
    snapshot(): PrivateMetricsSnapshot;
}
```

## PrivateMetricsSnapshot

[Source declaration](../src/observability/PrivateMetricsServer.ts)

```ts
export interface PrivateMetricsSnapshot {
    healthy: boolean;
    nodes: {
        total: number;
        ready: number;
        draining: number;
    };
    players: {
        total: number;
        playing: number;
        paused: number;
    };
}
```

## ProtocolResponseError

[Source declaration](../src/backends/ProtocolValidation.ts)

```ts
export declare class ProtocolResponseError extends TypeError {
    readonly operation: string;
    readonly field: string;
    readonly code = "INVALID_PROTOCOL_RESPONSE";
    constructor(operation: string, field: string);
}
```

## Queue

[Source declaration](../src/entities/Queue.ts)

```ts
export declare class Queue {
    tracks: Track[];
    constructor(player: Player);
    get size(): number;
    get first(): Track | undefined;
    get last(): Track | undefined;
    get isEmpty(): boolean;
    get duration(): number;
    get remainingDuration(): number;
    get all(): Track[];
    add(track: Track | Track[]): void;
    insert(index: number, track: Track | Track[]): void;
    get(position: number): Track | undefined;
    has(track: Track): boolean;
    remove(index?: number): Track | undefined;
    shift(): Track | undefined;
    unshift(track: Track): void;
    pop(): Track | undefined;
    clear(): void;
    shuffle(): void;
    shuffleRange(start: number, end: number): void;
    removeDuplicates(): boolean;
    sortByTitle(): void;
    sortByAuthor(): void;
    sortByDuration(): void;
    find(query: string): Track | undefined;
    move(from: number, to: number): boolean;
    moveRange(fromIndex: number, toIndex: number, count: number): boolean;
    removeRange(startIndex: number, endIndex: number): boolean;
    duplicate(index: number, count?: number): boolean;
    jump(index: number): boolean;
    slice(start: number, end?: number): Track[];
    filter(predicate: (track: Track) => boolean): Track[];
    reverse(): void;
    [Symbol.iterator](): Iterator<Track>;
    map<U>(callback: (track: Track, index: number, array: Track[]) => U): U[];
    at(index: number): Track | undefined;
    swap(index1: number, index2: number): boolean;
    replace(index: number, track: Track): boolean;
    removeWhere(predicate: (track: Track) => boolean): Track[];
    truncate(size: number): boolean;
}
```

## QueuePreloadOptions

[Source declaration](../src/backends/NodeLinkContracts.ts)

```ts
export interface QueuePreloadOptions {
    enabled: boolean;
    leadMs?: number;
}
```

## readHoloTrackMetadata

[Source declaration](../src/backends/HoloTrackMetadata.ts)

```ts
export declare function readHoloTrackMetadata(value: unknown): HoloTrackMetadata | undefined;
```

## readLavaSrcPlaylistMetadata

[Source declaration](../src/backends/LavaSrcMetadata.ts)

```ts
export declare function readLavaSrcPlaylistMetadata(value: unknown): LavaSrcPlaylistMetadata | undefined;
```

## readLavaSrcTrackMetadata

[Source declaration](../src/backends/LavaSrcMetadata.ts)

```ts
export declare function readLavaSrcTrackMetadata(value: unknown): LavaSrcTrackMetadata | undefined;
```

## readNodeLinkLyricsEvent

[Source declaration](../src/backends/NodeLinkLyricsEvents.ts)

```ts
export declare function readNodeLinkLyricsEvent(value: unknown): NodeLinkLyricsObservation | undefined;
```

## readNodeLinkMediaMetadata

[Source declaration](../src/backends/NodeLinkMediaMetadata.ts)

```ts
export declare function readNodeLinkMediaMetadata(pluginInfo: unknown): NodeLinkMediaMetadata | undefined;
```

## readNodeLinkPlayerTelemetry

[Source declaration](../src/backends/NodeLinkPlayerTelemetry.ts)

```ts
export declare function readNodeLinkPlayerTelemetry(player: unknown): NodeLinkPlayerTelemetry | undefined;
```

## readSponsorBlockEvent

[Source declaration](../src/backends/SponsorBlockEvents.ts)

```ts
export declare function readSponsorBlockEvent(value: unknown, backend?: BackendKind): SponsorBlockObservation | undefined;
```

## RecommendationCandidate

[Source declaration](../src/autoplay/RecommendationPreference.ts)

```ts
export interface RecommendationCandidate {
    readonly title: string;
    readonly author: string;
    readonly durationMs: number;
    readonly source: string;
    readonly isrc?: string;
}
```

## RecommendationDiscoveryOptions

[Source declaration](../src/autoplay/RecommendationDiscovery.ts)

```ts
export interface RecommendationDiscoveryOptions {
    providers: readonly RecommendationProvider[];
    timeoutMs?: number;
    maxCandidates?: number;
}
```

## RecommendationPreferences

[Source declaration](../src/autoplay/RecommendationPreference.ts)

```ts
export interface RecommendationPreferences {
    score(candidate: RecommendationCandidate, context: {
        readonly guildId: string;
        readonly seed: RecommendationCandidate;
    }): number;
}
```

## RecommendationProvider

[Source declaration](../src/autoplay/RecommendationDiscovery.ts)

```ts
export type RecommendationProvider = typeof recommendationProviders[number];
```

## recommendationProviders

[Source declaration](../src/autoplay/RecommendationDiscovery.ts)

```ts
export declare const recommendationProviders: readonly [
    "spotify",
    "deezer",
    "tidal"
];
```

## RedisCommandClient

[Source declaration](../src/database/RedisStorage.ts)

```ts
export interface RedisCommandClient {
    sendCommand(args: string[]): Promise<unknown>;
}
```

## RedisGuildIpcOptions

[Source declaration](../src/cluster/RedisGuildIpcRouter.ts)

```ts
export interface RedisGuildIpcOptions {
    client: RedisCommandClient;
    namespace: string;
    dedupeTtlMs?: number;
}
```

## RedisGuildIpcRouter

[Source declaration](../src/cluster/RedisGuildIpcRouter.ts)

```ts
export declare class RedisGuildIpcRouter {
    constructor(options: RedisGuildIpcOptions);
    prepare(ownership: GuildOwnership, guildId: string, packet: GuildVoiceGatewayPacket): Promise<FencedGuildVoiceEnvelope>;
    dispatch(message: unknown, deliver: (packet: GuildVoiceGatewayPacket) => void | Promise<void>): Promise<GuildVoiceDispatchStatus>;
}
```

## RedisGuildLease

[Source declaration](../src/database/RedisGuildLeaseCoordinator.ts)

```ts
export interface RedisGuildLease {
    readonly guildId: string;
    readonly fencingToken: number;
}
```

## RedisGuildLeaseCoordinator

[Source declaration](../src/database/RedisGuildLeaseCoordinator.ts)

```ts
export declare class RedisGuildLeaseCoordinator {
    get durationMs(): number;
    constructor(options: RedisGuildLeaseOptions);
    acquire(guildId: string): Promise<RedisGuildLease | null>;
    renew(lease: RedisGuildLease): Promise<boolean>;
    isCurrent(lease: RedisGuildLease): Promise<boolean>;
    release(lease: RedisGuildLease): Promise<boolean>;
    close(): Promise<void>;
}
```

## RedisGuildLeaseOptions

[Source declaration](../src/database/RedisGuildLeaseCoordinator.ts)

```ts
export interface RedisGuildLeaseOptions {
    client: RedisCommandClient;
    namespace: string;
    ttlMs?: number;
}
```

## RedisStorage

[Source declaration](../src/database/RedisStorage.ts)

```ts
export declare class RedisStorage implements StorageAdapter {
    constructor(options: RedisStorageOptions);
    init(_manager: Manager): Promise<void>;
    get<T>(path: string): Promise<T | undefined>;
    set<T>(path: string, value: T): Promise<void>;
    remove(path: string): Promise<boolean>;
    has(path: string): Promise<boolean>;
    compareAndSet<T>(path: string, revision: string | null, value: T | undefined): Promise<boolean>;
    keys(pattern?: string): Promise<string[]>;
    clear(): Promise<void>;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
}
```

## RedisStorageOptions

[Source declaration](../src/database/RedisStorage.ts)

```ts
export interface RedisStorageOptions {
    client: RedisCommandClient;
    namespace: string;
}
```

## Rest

[Source declaration](../src/entities/Rest.ts)

```ts
export declare class Rest {
    constructor(node: Node);
    get url(): string;
    callPlugin<T>(route: BackendPluginRoute<T>, options?: BackendPluginRequest): Promise<T>;
    getGroups(): Promise<PlayerGroup[]>;
    getGroup(groupId: string): Promise<PlayerGroup>;
    createGroup(options: GroupCreate): Promise<PlayerGroup>;
    updateGroup(groupId: string, options: GroupPatch): Promise<GroupPatchResult>;
    deleteGroup(groupId: string): Promise<void>;
    getLavalinkSponsorBlockCategories(guildId: string): Promise<LavalinkSponsorBlockCategory[]>;
    setLavalinkSponsorBlockCategories(guildId: string, categories: LavalinkSponsorBlockCategory[]): Promise<void>;
    clearLavalinkSponsorBlockCategories(guildId: string): Promise<void>;
    getSponsorBlock(guildId: string): Promise<SponsorBlockState>;
    updateSponsorBlock(guildId: string, options: SponsorBlockOptions): Promise<SponsorBlockState>;
    setSponsorBlockSegments(guildId: string, segments: SponsorBlockSegment[]): Promise<SponsorBlockState>;
    clearSponsorBlock(guildId: string): Promise<void>;
    getPlayers(): Promise<IRESTGetPlayers[] | null>;
    getPlayer(guildId: string): Promise<IRESTGetPlayers | null>;
    updatePlayer(guildId: string, data: PlayerUpdatePayload, noReplace?: boolean): Promise<PlayerUpdateAcknowledgement | null>;
    destroyPlayer(guildId: string, options?: {
        timeoutMs?: number;
        signal?: AbortSignal;
    }): Promise<void>;
    loadNodeLinkSearch(query: string, options?: NodeLinkDiscoveryOptions): Promise<IRESTLoadTracks>;
    loadTracks(identifier: string, options?: {
        timeoutMs: number;
        signal?: AbortSignal;
    }): Promise<IRESTLoadTracks>;
    decodeTrack(encodedTrack: string): Promise<ITrack | null>;
    decodeTracks(encodedTracks: string[]): Promise<ITrack[] | null>;
    getInfo(): Promise<any | null>;
    getInfoWithHeaders(): Promise<ResponseWithHeaders<any> | null>;
    getVersion(timeout?: number, retries?: number): Promise<string | null>;
    getStats(): Promise<INodeStats | null>;
    getRoutePlannerStatus(): Promise<IRoutePlannerStatus | null>;
    freeFailedAddress(address: string): Promise<void>;
    freeAllFailedAddresses(): Promise<void>;
    updateSession(resuming: boolean, timeout: number): Promise<SessionUpdateResponse | null>;
    addMixLayer(guildId: string, data: {
        track: {
            encoded: string;
            userData?: Record<string, any>;
        };
        volume?: number;
    }): Promise<MixLayerCreated | null>;
    getMixLayers(guildId: string): Promise<MixLayersResponse | null>;
    updateMixLayerVolume(guildId: string, mixId: string, volume: number): Promise<void>;
    removeMixLayer(guildId: string, mixId: string): Promise<void>;
    loadSearch(query: string, options?: LavaSearchOptions): Promise<LavaSearchResult | null>;
    getLyricsKt(videoId: string, options?: LyricsKtOptions): Promise<LyricsKtResult | null>;
    getCurrentLyricsKt(guildId: string, options?: LyricsKtOptions): Promise<LyricsKtResult | null>;
    searchLyricsKt(query: string, options?: LyricsKtOptions): Promise<LyricsKtSearchTrack[]>;
    getLavaLyrics(encodedTrack: string, options?: LavaLyricsOptions): Promise<LavaLyricsData | null>;
    getCurrentLavaLyrics(guildId: string, options?: LavaLyricsOptions): Promise<LavaLyricsData | null>;
    subscribeLavaLyrics(guildId: string, options?: LavaLyricsOptions): Promise<void>;
    unsubscribeLavaLyrics(guildId: string): Promise<void>;
    loadMedia(lookup: NodeLinkMediaLookup): Promise<NodeLinkMediaLookupResult>;
    loadLyrics(encodedTrack: string, options?: string | LyricsRequestOptions): Promise<NodeLinkResponse<ILyricsData | Record<string, any>> | null>;
    getSourceHealth(): Promise<SourceHealthResponse>;
    loadChapters(encodedTrack: string): Promise<NodeLinkResponse<IChapter[]> | null>;
    loadMeaning(encodedTrack: string, lang?: string): Promise<NodeLinkResponse<IMeaningResponse | Record<string, any>> | null>;
    getConnectionStatus(): Promise<NodeLinkResponse<INodeConnectionStatus> | null>;
    getLavalinkMetrics(names?: readonly string[]): Promise<string | null>;
    getMetrics(): Promise<string | null>;
    getNodeLinkProfilerStatus(options: NodeLinkProfilerOptions): Promise<NodeLinkProfilerSnapshot>;
    getNodeLinkWorkerSnapshots(): Promise<NodeLinkWorkerSnapshot[]>;
    getWorkers(): Promise<NodeLinkResponse<any[]> | null>;
    patchWorker(payload: Record<string, any>): Promise<any | null>;
    getLavalinkYoutubeConfig(options: LavalinkYoutubeAdminOptions): Promise<LavalinkYoutubeConfig>;
    updateLavalinkYoutubeConfig(payload: LavalinkYoutubeConfigUpdate, options: LavalinkYoutubeAdminOptions): Promise<void>;
    exchangeLavalinkYoutubeOAuth(refreshToken: string, options: LavalinkYoutubeAdminOptions): Promise<LavalinkYoutubeOAuthToken>;
    loadLavalinkYoutubeStream(videoId: string, options?: LavalinkYoutubeStreamOptions): Promise<LavalinkYoutubeStream>;
    getNodeLinkYoutubeConfig(options: NodeLinkAdminOptions, validate?: boolean): Promise<NodeLinkYoutubeConfig>;
    updateNodeLinkYoutubeConfig(payload: NodeLinkYoutubeConfigUpdate, options: NodeLinkAdminOptions): Promise<NodeLinkYoutubeConfigAcknowledgement>;
    terminateNodeLinkWorker(target: NodeLinkWorkerTarget, options: NodeLinkWorkerTerminationOptions): Promise<NodeLinkWorkerTermination>;
    getYoutubeConfig(validate?: boolean): Promise<any | null>;
    updateYoutubeConfig(payload: {
        refreshToken?: string;
        visitorData?: string;
    }): Promise<any | null>;
    exchangeYoutubeOAuth(refreshToken: string): Promise<any | null>;
    encodeTrackRemote(track: string): Promise<string | null>;
    encodeTracksRemote(tracks: Array<{
        encoded: string;
        info: Record<string, any>;
    }>): Promise<string[] | null>;
    trackStream(encodedTrack: string, itag?: number | null): Promise<any | null>;
    createHlsSession(encodedTrack: string, options?: NodeLinkHlsOptions): Promise<NodeLinkHlsManifest>;
    getHlsPlaylist(sessionId: string, options?: NodeLinkHlsReadOptions): Promise<NodeLinkHlsManifest>;
    getHlsInitSegment(sessionId: string, options?: NodeLinkHlsReadOptions): Promise<Buffer>;
    getHlsSegment(sessionId: string, index: number, options?: NodeLinkHlsReadOptions): Promise<Buffer>;
    getStreamFormats(encodedTrack: string, options?: {
        itag?: number;
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<NodeLinkStreamFormats>;
    loadStream(payload: {
        encodedTrack: string;
        volume?: number;
        position?: number;
        format?: 'raw' | 'pcm' | 'wav' | 'passthrough' | 'original' | 'source';
        itag?: number;
        filters?: IFilters | Record<string, any>;
    }, options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
        seekMode?: 'server' | 'pcm-trim';
        range?: string;
    }): Promise<{
        stream: NodeJS.ReadableStream;
        headers: Record<string, any>;
        statusCode: number;
    }>;
    subscribeLyrics(guildId: string, skipTrackSource?: boolean): Promise<void>;
    unsubscribeLyrics(guildId: string): Promise<void>;
}
```

## RoutePlannerType

[Source declaration](../src/typings/Interfaces.ts)

```ts
export type RoutePlannerType = "RotatingIpRoutePlanner" | "NanoIpRoutePlanner" | "RotatingNanoIpRoutePlanner" | "BalancingIpRoutePlanner";
```

## SearchResult

[Source declaration](../src/structures/SearchResult.ts)

```ts
export declare class SearchResult {
    loadType: LoadType;
    tracks: Track[];
    playlistPluginInfo?: Record<string, unknown>;
    playlistInfo?: {
        name: string;
        selectedTrack: number;
        duration: number;
    };
    exception?: {
        message: string;
        severity: string;
    };
    constructor(response: IRESTLoadTracks, requester?: any, playlistLoadLimit?: number, partialTrackOptions?: readonly TPartialTrackProperties[]);
    getLavaSrcMetadata(): LavaSrcPlaylistMetadata | undefined;
    get isPlaylist(): boolean;
    get isTrack(): boolean;
    get isSearch(): boolean;
    get isEmpty(): boolean;
    get isError(): boolean;
}
```

## SessionUpdateResponse

[Source declaration](../src/backends/ProtocolContracts.ts)

```ts
export type SessionUpdateResponse = {
    resuming: boolean;
    timeout: number;
};
```

## SnapshotConflictError

[Source declaration](../src/database/PlayerSnapshot.ts)

```ts
export declare class SnapshotConflictError extends Error {
    readonly code = "SNAPSHOT_CONFLICT";
    constructor();
}
```

## SnapshotValidationError

[Source declaration](../src/database/PlayerSnapshot.ts)

```ts
export declare class SnapshotValidationError extends TypeError {
    readonly code = "INVALID_SNAPSHOT";
    constructor(message: string);
}
```

## SourceHealthChangeEvent

[Source declaration](../src/backends/NodeLinkContracts.ts)

```ts
export interface SourceHealthChangeEvent extends SourceHealthEntry {
    op: 'event';
    type: 'SourceHealthChangeEvent';
    source: string;
    previousStatus: SourceHealthStatus;
    timestamp: number;
}
```

## SourceHealthEntry

[Source declaration](../src/backends/NodeLinkContracts.ts)

```ts
export interface SourceHealthEntry {
    status: SourceHealthStatus;
    reason?: string | null;
    message?: string;
    recommendedAction?: string | null;
    latency?: {
        p50: number;
        p95: number;
        jitter: number;
        average?: number;
    };
    successRate?: number;
    circuitBreaker?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    totalRequests?: number;
    consecutiveFailures?: number;
    lastActivityAt?: number | null;
    lastSuccessAt?: number | null;
    lastFailureAt?: number | null;
}
```

## SourceHealthEvent

[Source declaration](../src/backends/NodeLinkContracts.ts)

```ts
export type SourceHealthEvent = SourceHealthSnapshotEvent | SourceHealthChangeEvent;
```

## SourceHealthObservation

[Source declaration](../src/nodes/SourceHealthMonitor.ts)

```ts
export type SourceHealthObservation = {
    source: string;
    health: SourceHealthEntry;
    receivedAt: number;
    timestamp?: number;
};
```

## SourceHealthResponse

[Source declaration](../src/backends/NodeLinkContracts.ts)

```ts
export interface SourceHealthResponse {
    enabled: boolean;
    timestamp: number;
    summary: Record<SourceHealthStatus | 'total', number>;
    sources: Record<string, SourceHealthEntry>;
    probe: {
        enabled: boolean;
        intervalMs: number;
        nextRunAt: number | null;
        lastRunAt: number | null;
        running: boolean;
        currentSources: Array<{
            source: string;
            startedAt: number;
        }>;
        nextSources: string[];
        eligibleSources: number;
    };
}
```

## SourceHealthSnapshotEvent

[Source declaration](../src/backends/NodeLinkContracts.ts)

```ts
export interface SourceHealthSnapshotEvent {
    op: 'event';
    type: 'SourceHealthSnapshotEvent';
    sources: Record<string, SourceHealthEntry>;
    timestamp?: number;
}
```

## SourceHealthStatus

[Source declaration](../src/backends/NodeLinkContracts.ts)

```ts
export type SourceHealthStatus = 'unknown' | 'idle' | 'healthy' | 'degraded' | 'unavailable' | 'rate_limited' | 'restricted' | 'misconfigured';
```

## SponsorBlockObservation

[Source declaration](../src/backends/SponsorBlockEvents.ts)

```ts
export type SponsorBlockObservation = Base & ({
    kind: 'segmentsLoaded';
    segments: SponsorSegment[];
} | {
    kind: 'segmentSkipped';
    segment: SponsorSegment;
} | {
    kind: 'chaptersLoaded';
    chapters: SponsorChapter[];
} | {
    kind: 'chapterStarted';
    chapter: SponsorChapter;
});
```

## SponsorBlockOptions

[Source declaration](../src/backends/NodeLinkOrchestration.ts)

```ts
export interface SponsorBlockOptions {
    enabled?: boolean;
    categories?: string[];
    actionTypes?: string[];
    skipMarginMs?: number;
}
```

## SponsorBlockSegment

[Source declaration](../src/backends/NodeLinkOrchestration.ts)

```ts
export interface SponsorBlockSegment {
    uuid: string;
    start: number;
    end: number;
    category: string;
    actionType: string;
    votes: number;
    locked: boolean;
    videoDuration: number;
    description: string;
}
```

## SponsorBlockState

[Source declaration](../src/backends/NodeLinkOrchestration.ts)

```ts
export interface SponsorBlockState extends Required<SponsorBlockOptions> {
    segments: SponsorBlockSegment[];
    lastSkippedUuid: string | null;
}
```

## SponsorChapter

[Source declaration](../src/backends/SponsorBlockEvents.ts)

```ts
export interface SponsorChapter {
    name: string;
    start: number;
    end: number;
    duration: number;
}
```

## SponsorSegment

[Source declaration](../src/backends/SponsorBlockEvents.ts)

```ts
export interface SponsorSegment {
    category: string;
    start: number;
    end: number;
}
```

## SpotifySource

[Source declaration](../src/sources/spotify.ts)

```ts
export declare class SpotifySource {
    name: string;
    constructor(manager: Manager);
    match(query: string): boolean;
    search(query: string, options?: {
        limit?: number;
        signal?: AbortSignal;
    }): Promise<{
        loadType: string;
        data: any;
    }>;
    load(rawUrl: string, options?: {
        limit?: number;
        signal?: AbortSignal;
    }): Promise<{
        loadType: string;
        data: any;
    }>;
    resolve(url: string): Promise<{
        loadType: string;
        data: any;
    }>;
}
```

## StorageAdapter

[Source declaration](../src/database/StorageAdapter.ts)

```ts
export interface StorageAdapter {
    init(manager: Manager, options?: any): Promise<void>;
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    remove(key: string): Promise<boolean>;
    has(key: string): Promise<boolean>;
    keys(pattern?: string): Promise<string[]>;
    clear(): Promise<void>;
    flush?(): Promise<void>;
    compareAndSet?<T>(key: string, expectedRevision: string | null, value: T | undefined): Promise<boolean>;
    shutdown(): Promise<void>;
}
```

## TelemetryGauge

[Source declaration](../src/observability/OpenTelemetry.ts)

```ts
export interface TelemetryGauge {
    addCallback(callback: (result: TelemetryObservation) => void): void;
    removeCallback(callback: (result: TelemetryObservation) => void): void;
}
```

## TelemetryMeter

[Source declaration](../src/observability/OpenTelemetry.ts)

```ts
export interface TelemetryMeter {
    createObservableGauge?(name: string, options?: {
        unit?: string;
    }): TelemetryGauge;
    createCounter(name: string): {
        add(value: number, attributes?: Attributes): void;
    };
    createHistogram(name: string, options?: {
        unit?: string;
    }): {
        record(value: number, attributes?: Attributes): void;
    };
}
```

## TelemetryObservation

[Source declaration](../src/observability/OpenTelemetry.ts)

```ts
export interface TelemetryObservation {
    observe(value: number, attributes?: Attributes): void;
}
```

## TelemetryOperation

[Source declaration](../src/observability/OpenTelemetry.ts)

```ts
export type TelemetryOperation = typeof operationNames[number];
```

## TelemetryOutcome

[Source declaration](../src/observability/OpenTelemetry.ts)

```ts
export type TelemetryOutcome = 'success' | 'empty' | 'error' | 'cancelled' | 'resolved';
```

## TelemetrySpan

[Source declaration](../src/observability/OpenTelemetry.ts)

```ts
export interface TelemetrySpan {
    setStatus(status: {
        code: 0 | 1 | 2;
    }): unknown;
    setAttribute(key: string, value: string): unknown;
    end(): void;
}
```

## TelemetryTracer

[Source declaration](../src/observability/OpenTelemetry.ts)

```ts
export interface TelemetryTracer {
    startSpan(name: string): TelemetrySpan;
    startActiveSpan?<T>(name: string, callback: (span: TelemetrySpan) => T): T;
}
```

## TerminalCoordinator

[Source declaration](../src/logging/TerminalCoordinator.ts)

```ts
export declare class TerminalCoordinator {
    constructor(options?: TerminalOptions);
    get stats(): TerminalStats;
    write(text: string, priority?: TerminalPriority): boolean;
    acquire(): TerminalLease | undefined;
    flush(signal?: AbortSignal): Promise<boolean>;
    close(signal?: AbortSignal): Promise<boolean>;
}
```

## TerminalDashboard

[Source declaration](../src/observability/TerminalDashboard.ts)

```ts
export declare class TerminalDashboard {
    constructor(manager: Manager, options?: TerminalDashboardOptions);
    snapshot(): TerminalDashboardSnapshot;
    render(): TerminalDashboardSnapshot;
    start(): () => void;
    stop(): void;
}
```

## TerminalDashboardOptions

[Source declaration](../src/observability/TerminalDashboard.ts)

```ts
export interface TerminalDashboardOptions {
    intervalMs?: number;
    maxNodes?: number;
    maxSources?: number;
    mode?: 'auto' | 'static';
}
```

## TerminalDashboardSnapshot

[Source declaration](../src/observability/TerminalDashboard.ts)

```ts
export interface TerminalDashboardSnapshot {
    performance?: PerformanceSnapshot;
    timestamp: string;
    nodes: Array<{
        id: string;
        backend: string;
        state: string;
        players: number;
        latencyMs?: number;
        cpuLoad?: number;
        memoryUsedBytes?: number;
        statsAgeMs?: number;
    }>;
    audio: {
        players: number;
        playing: number;
        paused: number;
        queuedTracks: number;
    };
    sources: Array<{
        nodeId: string;
        source: string;
        status: string;
        ageMs: number;
        successRate?: number;
        p95Ms?: number;
        circuitBreaker?: string;
    }>;
    runtime: {
        uptimeSeconds: number;
        rssBytes: number;
        heapUsedBytes: number;
        eventLoopUtilization: number;
    };
    truncatedNodes: number;
    truncatedSources: number;
}
```

## TerminalLease

[Source declaration](../src/logging/TerminalCoordinator.ts)

```ts
export interface TerminalLease {
    update(text: string): boolean;
    release(): void;
}
```

## TerminalOptions

[Source declaration](../src/logging/TerminalCoordinator.ts)

```ts
export type TerminalOptions = {
    stream?: Writable & {
        isTTY?: boolean;
        columns?: number;
    };
    maxQueued?: number;
    maxRecordBytes?: number;
    interactive?: boolean;
    color?: boolean;
    onRejected?: (reason: TerminalRejectReason, priority: TerminalPriority) => void;
    onCriticalRejected?: (reason: TerminalRejectReason, text: string) => void;
};
```

## TerminalPriority

[Source declaration](../src/logging/TerminalCoordinator.ts)

```ts
export type TerminalPriority = 'normal' | 'critical';
```

## TerminalRejectReason

[Source declaration](../src/logging/TerminalCoordinator.ts)

```ts
export type TerminalRejectReason = 'capacity' | 'closed' | 'stream-error' | 'invalid-record';
```

## TerminalStats

[Source declaration](../src/logging/TerminalCoordinator.ts)

```ts
export type TerminalStats = {
    queued: number;
    accepted: number;
    rejected: number;
    evicted: number;
    streamErrors: number;
};
```

## Track

[Source declaration](../src/entities/Track.ts)

```ts
export declare class Track {
    readonly encoded: string;
    title: string;
    author: string;
    duration?: number;
    identifier?: string;
    isSeekable?: boolean;
    isStream?: boolean;
    uri?: string | null;
    artworkUrl?: string | null;
    isrc?: string | null;
    sourceName?: string;
    position?: number;
    time?: number;
    requester: any;
    origin?: string;
    backend?: BackendKind;
    pluginInfo: Record<string, any>;
    userData: Record<string, any>;
    retries: number;
    constructor(data: ITrack | Record<string, any>, requester?: any, origin?: string, partialTrackOptions?: readonly TPartialTrackProperties[]);
    getHoloMetadata(): HoloTrackMetadata | undefined;
    getLavaSrcMetadata(): LavaSrcTrackMetadata | undefined;
    getNodeLinkMediaMetadata(): NodeLinkMediaMetadata | undefined;
    isPartialTrack(): boolean;
    get thumbnail(): string | null;
    setRequester(requester: any): this;
    setPosition(position: number): this;
    clone(): Track;
    getInfo(): ITrackInfo;
    toJSON(): ITrack;
}
```

## TrackCodec

[Source declaration](../src/tracks/TrackCodec.ts)

```ts
export declare class TrackCodec {
    static encode(info: ITrackInfo): string;
    static decode(encoded: string): ITrack;
    static serialize(track: Track): TrackSnapshot;
    static restore(data: Partial<TrackSnapshot> & {
        encoded: string;
        position?: number;
    }): Track;
}
```

## TrackResolutionError

[Source declaration](../src/tracks/TrackResolver.ts)

```ts
export declare class TrackResolutionError extends Error {
    readonly code = "TRACK_RESOLUTION_FAILED";
    constructor(message: string);
}
```

## TrackResolver

[Source declaration](../src/tracks/TrackResolver.ts)

```ts
export declare class TrackResolver {
    static resolve(track: Track, target: Node, source?: Node, signal?: AbortSignal): Promise<Track>;
}
```

## TrackSnapshot

[Source declaration](../src/tracks/TrackCodec.ts)

```ts
export type TrackSnapshot = ITrack & {
    requester?: any;
    origin?: string;
    backend?: BackendKind;
};
```

## version

[Source declaration](../index.ts)

```ts
export declare const version: string;
```

## VoiceConnectionState

[Source declaration](../src/typings/types.ts)

```ts
export declare enum VoiceConnectionState {
    CONNECTING = 0,
    CONNECTED = 1,
    DISCONNECTED = 2,
    DESTROYED = 3
}
```

## VoicePacketHandler

[Source declaration](../src/entities/VoicePacketHandler.ts)

```ts
export declare class VoicePacketHandler {
    static handle(manager: Manager, packet: unknown): Promise<void>;
}
```

## VoiceReceiver

[Source declaration](../src/entities/VoiceReceiver.ts)

```ts
export declare class VoiceReceiver extends EventEmitter<VoiceReceiverEvents> {
    constructor(node: Node, guildId: string, options?: VoiceReceiverOptions);
    connect(): this;
    close(code?: number, reason?: string): void;
}
```

## WebSocket

[Source declaration](../src/services/WebSocket.ts)

```ts
export declare class WebSocket extends EventEmitter {
    latency: number;
    constructor(url: string, options?: {
        headers?: Record<string, string>;
    });
    ping(data?: string | Buffer): Promise<number>;
    send(data: string | Buffer): void;
    close(code?: number, reason?: string): void;
    get readyState(): number;
}
```

## YouTubeLiveChat

[Source declaration](../src/entities/YouTubeLiveChat.ts)

```ts
export declare class YouTubeLiveChat extends EventEmitter<YouTubeLiveChatEvents> {
    readonly identifier: string;
    constructor(node: Node, identifier: string, options?: YouTubeLiveChatOptions);
    connect(): this;
    close(code?: number, reason?: string): void;
}
```
