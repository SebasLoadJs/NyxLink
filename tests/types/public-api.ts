import { Manager, Player, Node, Track, Queue, Rest, Filters, SearchResult, NodeManager, PlayerManager, WebSocket, Connectors, VoiceReceiver, YouTubeLiveChat, SpotifySource, DeezerSource, Logger, NodeSelector, NodeHealthMonitor, NodeFailover, BackendDetector, HttpError, FeatureUnavailableError, NoEligibleNodeError, NodeCircuitBreaker, CircuitOpenError, type CircuitState, type CircuitBreakerOptions, type NodeRequirements, type NodeSelectionOptions, type NodeRejection, type FailoverResult, type StorageAdapter, type TrackSnapshot, TrackCodec, TrackResolver, TrackResolutionError, VoicePacketHandler, Memory, Local, version, PlayerSnapshotCodec, SnapshotConflictError, SnapshotValidationError, type PlayerSnapshot } from '../../dist';

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
declare const httpPolicyError: import('../../dist').HttpPolicyError;
const httpPolicyCode: 'HTTP_POLICY_REJECTED' = httpPolicyError.code;
const httpPolicyReason: import('../../dist').HttpPolicyReason = 'origin';
void [httpPolicyCode, httpPolicyReason];
const serverWait: number | undefined = new HttpError(429, undefined, '5').retryAfterMs;
void serverWait;
const pinnedPlayer: Player = manager.players.create({ guildId: '123456789012345678', voiceChannelId: '223456789012345678', node: node.identifier });
const resumedPlayer: Player = manager.players.restore({ guildId: '323456789012345678', voiceChannelId: '223456789012345678', node: node.identifier });
// @ts-expect-error A named node must be identified by its string identifier.
manager.players.create({ guildId: '123456789012345678', voiceChannelId: '223456789012345678', node: 1 });
void [pinnedPlayer, resumedPlayer];
const restart: Promise<boolean> = player.restart({ destroyOnFailure: false, startQueued: false });
const filterPayload: ReturnType<Filters['toPayload']> = player.filters.toPayload();
const cleanup: Promise<void> = node.rest.destroyPlayer(player.guildId, { timeoutMs: 10000, signal: new AbortController().signal });
void [restart, transfer, filterPayload, cleanup];
const backup: Promise<PlayerSnapshot> = player.exportSnapshot();
const persisted: Promise<PlayerSnapshot | undefined> = manager.database.exportPlayer(player.guildId);
const imported: Promise<PlayerSnapshot> = manager.database.importPlayer('{}', null);
const parsed: PlayerSnapshot = PlayerSnapshotCodec.parse('{}');
const compare: Promise<boolean> = new Memory().compareAndSet('record', null, { revision: 'opaque' });
// @ts-expect-error Snapshot import requires an explicit expected revision.
manager.database.importPlayer(parsed);
const conflictCode: 'SNAPSHOT_CONFLICT' = new SnapshotConflictError().code;
const validationCode: 'INVALID_SNAPSHOT' = new SnapshotValidationError('Invalid').code;
void [backup, persisted, imported, parsed, compare, conflictCode, validationCode];

// Node manager results are typed, rather than silently exposing any.
const selectedNode: Node | undefined = manager.nodes.findNode();
const onlineNodes: Node[] = manager.nodes.onlineNodes;
const readyNodes: Node[] = manager.nodes.ready;
// @ts-expect-error Only Nodes may be inserted in the public node registry.
manager.nodes.nodes.set('invalid', { invalid: true });
// @ts-expect-error No arbitrary properties exist on a selected Node.
selectedNode?.nonexistentAudioProperty;
void [selectedNode, onlineNodes, readyNodes];

const typedSearch: Promise<SearchResult> = manager.search({query: 'typed search'});
// @ts-expect-error Search results do not expose arbitrary properties.
search.then(result => result.nonexistentSearchProperty);
void typedSearch;

const partialDuration: number | undefined = track.duration;
const fullDuration: number = track.getInfo().length;
// @ts-expect-error Partial fields must be narrowed before assuming they are present.
const unsafeDuration: number = track.duration;
void [partialDuration, fullDuration, unsafeDuration];

const inventory: import('../../dist').BackendInventoryEntry[] = manager.nodes.getBackendInventory();
const refreshBackend: Promise<boolean> = node.refreshBackend();
// @ts-expect-error Inventory entries never contain the node password.
inventory[0].password;
void [inventory, refreshBackend];

const sharedUpdate: import('../../dist').CommonPlayerUpdate = {track:{encoded:'encoded'},endTime:120000,paused:false};
const extensionUpdate: import('../../dist').NodeLinkPlayerUpdate = {nextTrack:null,loudnessNormalizer:false};
const sessionUpdate: Promise<import('../../dist').SessionUpdateResponse | null> = node.rest.updateSession(true,60);
// @ts-expect-error Common contracts do not include NodeLink-only preloading.
const invalidShared: import('../../dist').CommonPlayerUpdate = {nextTrack:null};
// @ts-expect-error Position must be numeric.
player.updatePlayer({position:'1000'});
void [sharedUpdate,extensionUpdate,sessionUpdate,invalidShared];

const healthResponse: Promise<import('../../dist').SourceHealthResponse> = node.getSourceHealth();
node.loadLyrics(track, { type: 'onlyCaptions', source: 'youtube', lang: 'es' });
node.loadLyrics(track, 'es');
// @ts-expect-error Unsupported lyrics mode.
node.loadLyrics(track, { type: 'audio' });
void healthResponse;

const crossfade: import('../../dist').CrossfadeOptions = { enabled:true, duration:5000, mode:'smart', curve:'sinusoidal' };
void player.setCrossfade(crossfade);
const requestedCrossfade: import('../../dist').CrossfadeOptions | undefined = player.getCrossfade();
// @ts-expect-error Only supported transition modes are accepted.
void player.setCrossfade({enabled:true,mode:'random'});
void requestedCrossfade;

const lavaLyricsOptions: import('../../dist').LavaLyricsOptions = { skipTrackSource: true };
const lavaLyricsResult: Promise<import('../../dist').LavaLyricsData | null> =
    node.getLavaLyrics(track, lavaLyricsOptions);
const lavaLyricsViaRest: Promise<import('../../dist').LavaLyricsData | null> =
    node.rest.getLavaLyrics(track.encoded, { skipTrackSource: false });
// @ts-expect-error LavaLyrics does not accept the NodeLink language selector.
node.getLavaLyrics(track, 'es');
// @ts-expect-error Only boolean skipTrackSource is legal.
node.getLavaLyrics(track, { skipTrackSource: 'yes' });
void [lavaLyricsResult, lavaLyricsViaRest];

const sponsorCategories: import('../../dist').LavalinkSponsorBlockCategory[] = ['sponsor', 'intro'];
const sponsorRead: Promise<import('../../dist').LavalinkSponsorBlockCategory[]> =
    node.getLavalinkSponsorBlockCategories('123456789012345678');
const sponsorWrite: Promise<void> = node.setLavalinkSponsorBlockCategories('123456789012345678', sponsorCategories);
const sponsorClear: Promise<void> = node.rest.clearLavalinkSponsorBlockCategories('123456789012345678');
// @ts-expect-error Server-side categories are a closed official list.
node.setLavalinkSponsorBlockCategories('123456789012345678', ['made_up']);
void [sponsorRead, sponsorWrite, sponsorClear];


const privateMetricsOptions: import('../../dist').PrivateMetricsOptions = {
    token: 'test-secret-for-private-diagnostics-only-12345',
    port: 0,
};
const metricsEndpoint: Promise<import('../../dist').PrivateMetricsServer> =
    manager.startPrivateMetricsServer(privateMetricsOptions);
const summary: import('../../dist').PrivateMetricsSnapshot | undefined = undefined;
const nodeSummary: import('../../dist').PrivateMetricsNode | undefined = undefined;
// @ts-expect-error Remote metrics binding is not supported by the core.
manager.startPrivateMetricsServer({ token: 'x', host: '0.0.0.0' });
// @ts-expect-error Remote dashboards cannot request arbitrary guild-identifying metrics.
const personalGuildId: string = ({} as import('../../dist').PrivateMetricsNode).guildId;
void [metricsEndpoint, summary, nodeSummary, personalGuildId];


const redisCommands: import('../../dist').RedisCommandClient = {
    sendCommand: async (args: string[]): Promise<unknown> => args[0] === 'PING' ? 'PONG' : null,
};
const redisStorage: import('../../dist').RedisStorage =
    new (require('../../dist').RedisStorage)({
        client: redisCommands, namespace: 'my_bot',
    } as import('../../dist').RedisStorageOptions);
const externalDatabaseOptions: import('../../dist').IManagerOptionsConfig['database'] = {
    type: 'external', adapter: redisStorage,
};
// @ts-expect-error Redis storage namespaces cannot be omitted from the public API.
const invalidRedisOptions: import('../../dist').RedisStorageOptions = { client: redisCommands };
void [redisStorage, externalDatabaseOptions, invalidRedisOptions];


const leaseCoordinator: import('../../dist').RedisGuildLeaseCoordinator =
    new (require('../../dist').RedisGuildLeaseCoordinator)({
        client: redisCommands, namespace: 'my_bot', ttlMs: 30000,
    } as import('../../dist').RedisGuildLeaseOptions);
const acquiredLease: Promise<import('../../dist').RedisGuildLease | null> =
    leaseCoordinator.acquire('123456789012345678');
const renewLease = (lease: import('../../dist').RedisGuildLease): Promise<boolean> =>
    leaseCoordinator.renew(lease);
// @ts-expect-error An owner cannot supply a custom arbitrary fencing identifier.
const invalidLease: import('../../dist').RedisGuildLease = { guildId: '123456789012345678', fencingToken: 'one' };
void [acquiredLease, renewLease, invalidLease];


const clusterCoordinator: import('../../dist').RedisGuildLeaseCoordinator =
    new (require('../../dist').RedisGuildLeaseCoordinator)({
        client: redisCommands, namespace: 'cluster_test', ttlMs: 30000,
    });
const ownershipConfig: import('../../dist').GuildOwnershipOptions = {
    coordinator: clusterCoordinator, renewIntervalMs: 5000,
};
const ownedManager = manager.useGuildLeases(ownershipConfig);
const ownedPlayer: Promise<import('../../dist').Player> =
    ownedManager.players.createOwned({
        guildId: '123456789012345678', voiceChannelId: '223456789012345678',
    });
const restoredOwnedPlayer: Promise<import('../../dist').Player> =
    ownedManager.players.restoreOwned({
        guildId: '123456789012345678', voiceChannelId: '223456789012345678',
        node: 'node-1',
    });
ownedManager.on('guildOwnershipLost', (guildId, generation, reason) => {
    const event: [string, number, string] = [guildId, generation, reason];
    void event;
});
void [ownedPlayer, restoredOwnedPlayer];


const ipcRouter = new (require('../../dist').RedisGuildIpcRouter)({
    client: redisCommands,
    namespace: 'cluster_test',
} as import('../../dist').RedisGuildIpcOptions) as import('../../dist').RedisGuildIpcRouter;
const voiceGatewayPacket: import('../../dist').GuildVoiceGatewayPacket = {
    op: 4,
    d: { guild_id: '123456789012345678', channel_id: null, self_deaf: true, self_mute: false },
};
const outboundEnvelope: Promise<import('../../dist').FencedGuildVoiceEnvelope> =
    ipcRouter.prepare(ownedManager.guildOwnership!, '123456789012345678', voiceGatewayPacket);
const routedPacket: Promise<import('../../dist').GuildVoiceDispatchStatus> =
    ipcRouter.dispatch({ invalid: true }, (_packet) => undefined);
// @ts-expect-error Only Discord voice opcode 4 is accepted for fenced gateway commands.
const badGatewayOpcode: import('../../dist').GuildVoiceGatewayPacket = { op: 5, d: voiceGatewayPacket.d };
// @ts-expect-error Fenced voice IPC requires a boolean Discord self_mute flag.
const invalidGatewayMute: import('../../dist').GuildVoiceGatewayPacket = { op: 4, d: { ...voiceGatewayPacket.d, self_mute: 'no' } };
void [outboundEnvelope, routedPacket, badGatewayOpcode, invalidGatewayMute];

const diagnosticLogger = new (require('../../dist').Logger)({
    profile: 'diagnostic', mode: 'json', layout: 'compact', timelineLimit: 100,
    sampleRate: 0.5, deduplicateMs: 1000,
    transports: [{ write(record: import('../../dist').StructuredLogRecord) { void record.context; } }],
} satisfies import('../../dist').LoggerOptions) as import('../../dist').Logger;
const correlated = diagnosticLogger.child({ guildId: '123456789012345678' });
const operationResult: Promise<number> = correlated.traceOperation('test', async log => { log.event('info', 'Test', 'observed'); return 1; });
const structuredEvents: import('../../dist').StructuredLogRecord[] = correlated.timeline({ limit: 10 });
const loggerStats: Readonly<import('../../dist').LogPipelineStats> = diagnosticLogger.getStats();
const diagnostic: import('../../dist').ErrorDiagnostic = diagnosticLogger.reportError(new Error('fixture'));
const mixCreated: Promise<import('../../dist').MixLayerCreated | null> = player.addMix('encoded', { volume: 0.5 });
const mixList: Promise<import('../../dist').MixLayersResponse | null> = player.getMixes();
// @ts-expect-error Mixer volume is numeric.
player.updateMixVolume('mix-id', 'loud');
// @ts-expect-error Structured log levels do not include arbitrary strings.
diagnosticLogger.event('invalid', 'Node', 'event');
void [operationResult, structuredEvents, loggerStats, diagnostic, mixCreated, mixList];

const optionalExtension: import('../../dist').NyxExtension = { name: 'typed-observer', setup(context) {
    context.on('trackStart', (playingPlayer, track) => { const ids: [string, string | undefined] = [playingPlayer.guildId, track.identifier]; void ids; });
    // @ts-expect-error Event names must be from the manager contract.
    context.on('inventedEvent', () => {});
    void context.signal;
} };
const extensionDisposer: Promise<() => Promise<void>> = manager.useExtension(optionalExtension);
void extensionDisposer;
const playerTraceRecords: import('../../dist').StructuredLogRecord[] = diagnosticLogger.playerTrace('123456789012345678', { limit: 10 });
const migrationStage: import('../../dist').MigrationStage = 'persist-snapshot';
void [playerTraceRecords, migrationStage];
