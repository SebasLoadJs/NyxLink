import { Manager, Player, Node, Track, Queue, Rest, Filters, SearchResult, NodeManager, PlayerManager, WebSocket, Connectors, VoiceReceiver, YouTubeLiveChat, SpotifySource, DeezerSource, Logger, NodeSelector, NodeHealthMonitor, NodeFailover, BackendDetector, HttpError, FeatureUnavailableError, NoEligibleNodeError, NodeCircuitBreaker, CircuitOpenError, type CircuitState, type CircuitBreakerOptions, type NodeRequirements, type NodeSelectionOptions, type NodeRejection, type FailoverResult, type StorageAdapter, type TrackSnapshot, TrackCodec, TrackResolver, TrackResolutionError, VoicePacketHandler, Memory, Local, version } from '../../dist';

declare const manager: Manager;
declare const player: Player;
declare const node: Node;
declare const track: Track;

const playing: Promise<boolean> = player.play({ track, position: 10 });
const stopping: Promise<Player> = player.stop();
const volume: Player = player.setVolume(75);
const asyncVolume: Promise<Player> = player.setVolumeAsync(75);
const logger = new Logger({ level: "debug", color: false });
const detach: () => void = logger.attachManager(manager);
manager.logger?.managerStatus(manager);
manager.detachLogger();
const autoplay: Player = player.setAutoPlay(false);
const transfer: Promise<boolean> = player.transferNode(node);
const search = manager.search({ query: 'test' });
const queue: Queue = player.queue;
const health = NodeHealthMonitor.inspect(node);
const selected = NodeSelector.select([node]);
const failover: Promise<FailoverResult> = NodeFailover.move(player, node, { maxAttempts: 2 });
const backend = BackendDetector.detect({ version: { semver: '4.2.2' } });
const configuredNode: Parameters<NodeManager['add']>[0] = { host: 'localhost', port: 2333, password: 'test', secure: false, retryAmount: 0, readyTimeoutMs: 10000 };
void [health, selected, failover, backend, HttpError, FeatureUnavailableError, configuredNode];
void [asyncVolume, detach, playing, stopping, volume, autoplay, transfer, search, queue, Rest, Filters, SearchResult, NodeManager, PlayerManager, WebSocket, Connectors, VoiceReceiver, YouTubeLiveChat, SpotifySource, DeezerSource, Logger, version];

const snapshot: TrackSnapshot = TrackCodec.serialize(track);
const restored: Track = TrackCodec.restore(snapshot);
const resolved: Promise<Track> = TrackResolver.resolve(track, node);
const adapter: StorageAdapter = new Memory();
const local: StorageAdapter = new Local();
const configured = new Manager({ nodes: [configuredNode], options: { database: { type: 'memory', adapter } } });
const flushed: Promise<void> = manager.database.flush();
const packet: Promise<void> = VoicePacketHandler.handle(manager, {});
void [snapshot, restored, resolved, local, configured, flushed, packet, TrackResolutionError];

const shuttingDown: Promise<void> = manager.shutdown();
const isClosed: boolean = manager.destroyed;
const connector = new Connectors.DiscordJs();
const disposed: void = connector.dispose();
void [shuttingDown, isClosed, disposed];

const searchConfig = new Manager({ nodes: [configuredNode], options: { search: { timeoutMs: 1000, fallbackPlatforms: ['soundcloud'], cache: { ttlMs: 5000, maxEntries: 10 }, resolver: async (_query, _node) => null } } });
const cancellable = manager.search({ query: 'local fixture', signal: AbortSignal.timeout(1000) });
const streaming = node.rest.loadStream({ encodedTrack: track.encoded, format: 'wav' }, { signal: AbortSignal.timeout(1000), timeoutMs: 1000 });
void [searchConfig, cancellable, streaming];

const requirements: NodeRequirements = { backend: 'nodelink', requiredCapabilities: ['source:http'] as const, region: 'eu', regionPolicy: 'require' };
const selection: NodeSelectionOptions = { ...requirements, exclude: ['maintenance'] as const, allowUnhealthyFallback: false };
const eligible = manager.nodes.findNode(selection);
const constrainedPlayer: Player = manager.players.create({ guildId: '123456789012345678', voiceChannelId: '223456789012345678', nodeSelection: requirements });
const retainedRequirements: NodeRequirements = constrainedPlayer.nodeSelection;
const rejections: NodeRejection[] = NodeSelector.rejections([node], {}, selection);
const matches: boolean = NodeSelector.matches(node, requirements);
const selectionError: NoEligibleNodeError = new NoEligibleNodeError(rejections);
const selectionCode: 'NO_ELIGIBLE_NODE' = selectionError.code;
// @ts-expect-error Captured requirements cannot be replaced after player creation.
constrainedPlayer.nodeSelection = {};
// @ts-expect-error Captured capabilities cannot be mutated in place.
constrainedPlayer.nodeSelection.requiredCapabilities?.push('mixer');
// @ts-expect-error Backend constraints accept only supported backend identities.
NodeSelector.select([node], {}, { backend: 'native' });
void [eligible, retainedRequirements, matches, selectionCode];

const circuitOptions: CircuitBreakerOptions = { failureThreshold: 3, windowMs: 30000, cooldownMs: 10000 };
const circuit = new NodeCircuitBreaker(circuitOptions);
const circuitState: CircuitState = node.circuit.state;
const guarded: Promise<number> = circuit.run(async () => 42);
const retryAt: number = new CircuitOpenError(1000).retryAt;
const probe: Promise<boolean> = node.probe();
declare const nodeManager: NodeManager;
const draining: boolean = nodeManager.setDraining(node.identifier, true);
const drained: Promise<boolean> = nodeManager.drain(node.identifier);
const protectedManager = new Manager({ nodes: [configuredNode], options: { node: { circuitBreaker: circuitOptions } } });
// @ts-expect-error A node owns its circuit for the lifetime of the connection object.
node.circuit = circuit;
void [circuitState, guarded, retryAt, probe, draining, drained, protectedManager];

const boundedManager = new Manager({ nodes: [configuredNode], options: { node: { recoveryConcurrency: 4, recoveryQueueLimit: 1000, retryJitter: 0.5, failover: { maxAttempts: 3, retryJitter: 1 } } } });
const jitteredNode: Parameters<NodeManager['add']>[0] = { ...configuredNode, retryJitter: 0.25 };
const admissionReason: FailoverResult['reason'] = 'queue-full';
void [boundedManager, jitteredNode, admissionReason];
const serverWait: number | undefined = new HttpError(429, undefined, '5').retryAfterMs;
void serverWait;
const pinnedPlayer: Player = manager.players.create({ guildId: '123456789012345678', voiceChannelId: '223456789012345678', node: node.identifier });
const resumedPlayer: Player = manager.players.restore({ guildId: '323456789012345678', voiceChannelId: '223456789012345678', node: node.identifier });
// @ts-expect-error A named node must be identified by its string identifier.
manager.players.create({ guildId: '123456789012345678', voiceChannelId: '223456789012345678', node: 1 });
void [pinnedPlayer, resumedPlayer];
