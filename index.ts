export type * from './src/typings/Interfaces';
export { NodeState, VoiceConnectionState, LoadType } from './src/typings/types';
export const version: string = require("../package.json").version as string;
export { Logger, ConsoleReporter, createPinoSink, createBanner, formatEntry, formatBox, formatSystemStatus, formatFailover } from './src/logging';
export { AuroraInspectorStore } from './src/logging/AuroraInspector';
export type { InspectorEvent, InspectorSpan, InspectorPlayer, InspectorSnapshot } from './src/logging/AuroraInspector';
export { AuroraMusicStrip, AuroraIncidentEngine, AuroraCapabilityExplorer } from './src/logging/AuroraDiagnostics';
export type { MusicSnapshot, IncidentState, IncidentSnapshot, CapabilityNode } from './src/logging/AuroraDiagnostics';
export { AuroraBootstrap } from './src/logging/AuroraBootstrap';
export type { BootstrapPhase, BootstrapSnapshot, BootstrapOptions } from './src/logging/AuroraBootstrap';
export { AuroraPresentation } from './src/logging/AuroraPresentation';
export type { AuroraVisualToolkit, AuroraVisualOptions } from './src/logging/AuroraPresentation';
export { TerminalCoordinator } from './src/logging/TerminalCoordinator';
export type { TerminalOptions, TerminalLease, TerminalStats, TerminalPriority, TerminalRejectReason } from './src/logging/TerminalCoordinator';
export { AuroraEvents, auroraCatalog } from './src/logging/AuroraEvents';
export type { AuroraEvent, AuroraEventCode, AuroraCategory, AuroraLevel, AuroraOutcome, AuroraContext, AuroraPinoTarget, AuroraEventOptions } from './src/logging/AuroraEvents';
export { OpenTelemetry } from './src/observability/OpenTelemetry';
export type { OpenTelemetryOptions, TelemetryMeter, TelemetryTracer } from './src/observability/OpenTelemetry';
export { PrivateMetricsServer } from './src/observability/PrivateMetricsServer';
export type { PrivateMetricsOptions, PrivateMetricsSnapshot, PrivateMetricsNode } from './src/observability/PrivateMetricsServer';
export type { LoggerOptions, NyxLogLevel, AudioNodeStatus, FailoverReport, StructuredLogRecord, StructuredLogSink, PinoLogTarget } from './src/logging';
export { BackendAdapter } from './src/backends/BackendAdapter';
export type { BackendKind, BackendPlugin, CapabilityState } from './src/backends/BackendAdapter';
export { CapabilityRegistry } from './src/backends/CapabilityRegistry';
export type { CapabilityDescription, CapabilityEvidence } from './src/backends/CapabilityRegistry';
export type { BackendInventoryEntry } from './src/backends/BackendInventory';
export { ProtocolResponseError } from './src/backends/ProtocolValidation';
export type { LyricsRequestOptions, SourceHealthStatus, SourceHealthEntry, SourceHealthResponse, SourceHealthEvent, SourceHealthSnapshotEvent, SourceHealthChangeEvent, CrossfadeOptions, QueuePreloadOptions } from './src/backends/NodeLinkContracts';
export type { LavaLyricsData, LavaLyricsLine, LavaLyricsOptions } from './src/backends/LavaLyricsContracts';
export { lavalinkSponsorBlockCategories } from './src/backends/LavalinkSponsorBlockContracts';
export type { LavalinkSponsorBlockCategory } from './src/backends/LavalinkSponsorBlockContracts';
export type { ExtensionOperation, ExtensionRoute, ExtensionRouteParameters } from './src/backends/ExtensionRoutes';
export type { CommonPlayerUpdate, NodeLinkPlayerUpdate, PlayerUpdatePayload, PlayerTrackUpdate, PlayerVoiceUpdate, PlayerUpdateAcknowledgement, SessionUpdateResponse } from './src/backends/ProtocolContracts';
export { BackendDetector } from './src/backends/BackendDetector';
export { LavalinkAdapter } from './src/backends/LavalinkAdapter';
export { NodeLinkAdapter } from './src/backends/NodeLinkAdapter';
export { NodeSelector } from './src/nodes/NodeSelector';
export type { NodeRequirements, NodeSelectionOptions, NodeRejection, NodeRejectionReason } from './src/nodes/NodeSelector';
export { NodeHealthMonitor } from './src/nodes/NodeHealthMonitor';
export { NodeCircuitBreaker } from './src/nodes/NodeCircuitBreaker';
export type { CircuitBreakerOptions, CircuitState } from './src/nodes/NodeCircuitBreaker';
export { CircuitOpenError } from './src/errors/CircuitOpenError';
export { NodeFailover } from './src/nodes/NodeFailover';
export type { NodeHealth } from './src/nodes/NodeHealthMonitor';
export type { FailoverOptions, FailoverResult } from './src/nodes/NodeFailover';
export { FeatureUnavailableError } from './src/errors/FeatureUnavailableError';
export { NoEligibleNodeError } from './src/errors/NoEligibleNodeError';
export { HttpError } from './src/errors/HttpError';
export { HttpPolicyError } from './src/errors/HttpPolicyError';
export type { HttpPolicyReason } from './src/errors/HttpPolicyError';
export type { StorageAdapter } from './src/database/StorageAdapter';
export { Memory } from './src/database/Memory';
export { RedisStorage } from './src/database/RedisStorage';
export type { RedisCommandClient, RedisStorageOptions } from './src/database/RedisStorage';
export { RedisGuildLeaseCoordinator } from './src/database/RedisGuildLeaseCoordinator';
export { GuildOwnership } from './src/cluster/GuildOwnership';
export type { GuildOwnershipOptions } from './src/cluster/GuildOwnership';
export { RedisGuildIpcRouter } from './src/cluster/RedisGuildIpcRouter';
export type { RedisGuildIpcOptions, FencedGuildVoiceEnvelope, GuildVoiceGatewayPacket, GuildVoiceDispatchStatus } from './src/cluster/RedisGuildIpcRouter';
export type { RedisGuildLease, RedisGuildLeaseOptions } from './src/database/RedisGuildLeaseCoordinator';
export { Local } from './src/database/Local';
export { PlayerSnapshotCodec, SnapshotConflictError, SnapshotValidationError } from './src/database/PlayerSnapshot';
export type { PlayerSnapshot, PlayerSnapshotData } from './src/database/PlayerSnapshot';
export { TrackCodec } from './src/tracks/TrackCodec';
export type { TrackSnapshot } from './src/tracks/TrackCodec';
export { TrackResolver, TrackResolutionError } from './src/tracks/TrackResolver';
export { VoicePacketHandler } from './src/entities/VoicePacketHandler';
import { Structure } from "./src/Util";
import { Manager } from "./src/core/Manager";
import { Node } from "./src/entities/Node";
import { Player } from "./src/entities/Player";
import { Queue } from "./src/entities/Queue";
import { Rest } from "./src/entities/Rest";
import { Filters } from "./src/entities/Filters";
import { Track } from "./src/entities/Track";
import { VoiceReceiver } from "./src/entities/VoiceReceiver";
import { YouTubeLiveChat } from "./src/entities/YouTubeLiveChat";
import { SearchResult } from "./src/structures/SearchResult";
import { NodeManager } from "./src/managers/NodeManager";
import { PlayerManager } from "./src/managers/PlayerManager";
import { WebSocket } from "./src/services/WebSocket";
import { Connectors } from "./src/connectors";
import { SpotifySource } from "./src/sources/spotify";
import { DeezerSource } from "./src/sources/deezer";

Structure.register("Node", Node);
Structure.register("Player", Player);
Structure.register("Queue", Queue);
Structure.register("Rest", Rest);
Structure.register("Filters", Filters);
Structure.register("Track", Track);
Structure.register("SearchResult", SearchResult);
Structure.register("NodeManager", NodeManager);
Structure.register("PlayerManager", PlayerManager);
Structure.register("WebSocket", WebSocket);

export {
    Manager,
    Node,
    Player,
    Queue,
    Rest,
    Filters,
    Track,
    VoiceReceiver,
    YouTubeLiveChat,
    SpotifySource,
    DeezerSource,
    SearchResult,
    NodeManager,
    PlayerManager,
    WebSocket,
    Connectors,
};

export type { SourceHealthObservation } from './src/nodes/SourceHealthMonitor';

export type { PlayerGroup, GroupCreate, GroupPatch, GroupPatchResult, SponsorBlockOptions, SponsorBlockSegment, SponsorBlockState } from './src/backends/NodeLinkOrchestration';
