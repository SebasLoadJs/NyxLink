"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Node = void 0;
const OpenTelemetry_1 = require("../observability/OpenTelemetry");
const SourceHealthMonitor_1 = require("../nodes/SourceHealthMonitor");
const NodeFailover_1 = require("../nodes/NodeFailover");
const BackendDetector_1 = require("../backends/BackendDetector");
const FeatureUnavailableError_1 = require("../errors/FeatureUnavailableError");
const RecommendationResolver_1 = require("../autoplay/RecommendationResolver");
const AutoPlayManager_1 = require("../autoplay/AutoPlayManager");
const PlaybackGuard_1 = require("../players/PlaybackGuard");
const PlaybackAttempt_1 = require("../players/PlaybackAttempt");
const VoiceRecovery_1 = require("../players/VoiceRecovery");
const TrackCodec_1 = require("../tracks/TrackCodec");
const NodeCircuitBreaker_1 = require("../nodes/NodeCircuitBreaker");
const SessionRecovery_1 = require("../nodes/SessionRecovery");
const RetryDelay_1 = require("../nodes/RetryDelay");
const Util_1 = require("../Util");
const types_1 = require("../typings/types");
const YouTubeLiveChat_1 = require("./YouTubeLiveChat");
const NodeHealthMonitor_1 = require("../nodes/NodeHealthMonitor");
class Node {
    manager;
    uuid;
    host;
    port;
    identifier;
    password;
    pathVersion;
    connected = false;
    destroyed = false;
    reconnectTimeout;
    reconnectAttempts = 0;
    retryAmount;
    retryDelay = 60000;
    retryJitter;
    resumed = false;
    resumeTimeout = 60000;
    resumeUpdateTimeout;
    resumeUpdateAttempts = 0;
    resumeUpdateInProgress = false;
    resumeUpdateMaxAttempts = 5;
    resumeUpdateBaseDelay = 2000;
    resumeWindowTimeout;
    resumeWindowActive = false;
    pendingRecovery = false;
    recoveryInProgress = false;
    regions;
    secure;
    sessionId = "";
    priority;
    socket;
    stats;
    statsReceivedAt;
    info;
    version;
    isNodeLink = false;
    backend;
    backendReady = Promise.resolve();
    backendGeneration = 0;
    sourceHealth = new SourceHealthMonitor_1.SourceHealthMonitor();
    backendRefresh;
    backendRefreshedAt;
    authenticationFailed = false;
    connecting = false;
    readyTimeout;
    voiceReconnectTimers = new Map();
    readyTimeoutMs;
    url;
    rest;
    lastStats;
    state = types_1.NodeState.DISCONNECTED;
    capabilities = new Set();
    circuit;
    draining = false;
    constructor(manager, config) {
        this.retryJitter = (0, RetryDelay_1.retryJitter)(config.retryJitter !== undefined ? config.retryJitter : manager.options.node?.retryJitter);
        this.circuit = new NodeCircuitBreaker_1.NodeCircuitBreaker(manager.options.node?.circuitBreaker);
        this.manager = manager;
        this.uuid = (0, Util_1.generateUUID)(config.host, config.port);
        this.host = config.host;
        this.port = config.port;
        this.identifier = config.identifier ?? this.uuid;
        this.password = config.password || "youshallnotpass";
        this.regions = [...(config.regions ?? [])];
        this.pathVersion = config.pathVersion || "v4";
        this.retryDelay = config.retryDelay ?? this.manager.options.node?.retryDelay ?? 30000;
        this.retryAmount = config.retryAmount ?? this.manager.options.node?.retryAmount ?? 5;
        this.priority = config.priority ?? 0;
        this.readyTimeoutMs = config.readyTimeoutMs ?? 10000;
        this.secure = config.secure;
        this.resumeTimeout = this.manager.options.resumeTimeout ?? 60000;
        this.url = `${this.secure ? "https" : "http"}://${this.address}/${this.pathVersion}/`;
        this.rest = new (Util_1.Structure.get("Rest"))(this);
        this.manager.emit("debug", `Moonlink.js > Node >> New node initialized. Identifier: ${this.identifier} (${this.host}:${this.port}), UUID: ${this.uuid}`);
    }
    get latency() {
        if (!this.socket)
            return -1;
        return this.socket.latency;
    }
    get health() {
        return NodeHealthMonitor_1.NodeHealthMonitor.inspect(this, this.manager.options.node);
    }
    assertFeature(feature) {
        if (!this.isNodeLink || this.backend?.featureStatus(feature) === 'unavailable') {
            throw new FeatureUnavailableError_1.FeatureUnavailableError(feature, this.backend?.kind ?? 'unknown');
        }
    }
    getPenalties() {
        if (!this.stats)
            return 0;
        const cpuLoad = this.stats.cpu.systemLoad;
        const players = this.stats.playingPlayers;
        return players + (cpuLoad * 100);
    }
    ping() {
        if (!this.connected || !this.socket) {
            return Promise.reject(new Error("Node is not connected."));
        }
        return this.socket.ping();
    }
    createYouTubeLiveChat(identifier, options) {
        if (!this.isNodeLink) {
            throw (0, Util_1.nodeLinkOnlyError)("youtubeLiveChat");
        }
        return new YouTubeLiveChat_1.YouTubeLiveChat(this, identifier, options);
    }
    getLavalinkSponsorBlockCategories(guildId) {
        return this.rest.getLavalinkSponsorBlockCategories(guildId);
    }
    setLavalinkSponsorBlockCategories(guildId, categories) {
        return this.rest.setLavalinkSponsorBlockCategories(guildId, categories);
    }
    clearLavalinkSponsorBlockCategories(guildId) {
        return this.rest.clearLavalinkSponsorBlockCategories(guildId);
    }
    async getLavaLyrics(track, options) {
        const encoded = typeof track === 'string' ? track : track?.encoded;
        if (!encoded)
            throw new TypeError('getLavaLyrics requires an encoded track');
        return this.rest.getLavaLyrics(encoded, options);
    }
    async loadLyrics(track, options) {
        const encoded = typeof track === "string" ? track : track?.encoded;
        if (!encoded) {
            throw new Error("loadLyrics requires an encoded track string or object with an encoded field.");
        }
        return this.rest.loadLyrics(encoded, options);
    }
    getSourceHealth() {
        return this.rest.getSourceHealth();
    }
    getStreamFormats(track, options = {}) {
        const encoded = typeof track === 'string' ? track : track?.encoded;
        if (!encoded)
            throw new TypeError('getStreamFormats requires an encoded track');
        return this.rest.getStreamFormats(encoded, options);
    }
    loadSourceStream(track, options = {}) {
        const encoded = typeof track === 'string' ? track : track?.encoded;
        if (!encoded)
            throw new TypeError('loadSourceStream requires an encoded track');
        const { itag, position, range, signal, timeoutMs } = options;
        return this.rest.loadStream({ encodedTrack: encoded, format: 'passthrough', ...(itag === undefined ? {} : { itag }), ...(position === undefined ? {} : { position }) }, { range, signal, timeoutMs });
    }
    async loadDirectStream(track, volume, position, filters, options = {}) {
        const encoded = typeof track === "string" ? track : track?.encoded;
        if (!encoded) {
            throw new Error("loadDirectStream requires an encoded track string or object with an encoded field.");
        }
        const payload = { encodedTrack: encoded };
        if (volume !== undefined)
            payload.volume = volume;
        if (position !== undefined)
            payload.position = position;
        if (filters !== undefined)
            payload.filters = filters;
        return this.rest.loadStream(payload, options);
    }
    async getDirectStream(track, itag) {
        const encoded = typeof track === "string" ? track : track?.encoded;
        if (!encoded) {
            throw new Error("getDirectStream requires an encoded track string or object with an encoded field.");
        }
        return this.rest.trackStream(encoded, itag);
    }
    get address() {
        return `${this.host}:${this.port}`;
    }
    setState(state) {
        const oldState = this.state;
        this.state = state;
        this.manager.emit("nodeStateChange", this, oldState, state);
    }
    get sessionStoragePath() {
        return `nodes.${this.uuid}.sessions.${(0, Util_1.generateUUID)(this.identifier, 0)}`;
    }
    async loadStoredSessionId() {
        const scoped = await this.manager.database.get(this.sessionStoragePath);
        if (typeof scoped?.sessionId === 'string' && scoped.sessionId)
            return scoped.sessionId;
        const shared = [...this.manager.nodes.nodes.values()].some(node => node !== this && node.uuid === this.uuid);
        if (shared)
            return undefined;
        const legacy = await this.manager.database.get(`nodes.${this.uuid}`);
        return typeof legacy?.sessionId === 'string' && legacy.sessionId ? legacy.sessionId : undefined;
    }
    async connect() {
        if (this.destroyed || this.connected || this.connecting || this.state === types_1.NodeState.CONNECTING && this.socket)
            return;
        this.connecting = true;
        return (0, OpenTelemetry_1.observeOperation)(this.manager, 'nyxlink.connect', async () => {
            try {
                this.setState(types_1.NodeState.CONNECTING);
                if (this.destroyed)
                    return;
                this.manager.emit("debug", `Moonlink.js > Node -> Attempting connection to ${this.identifier} (${this.host}:${this.port}).`);
                const sessionId = await this.loadStoredSessionId();
                if (this.destroyed)
                    return;
                let headers = {
                    Authorization: this.password,
                    "User-Id": this.manager.clientId,
                    "Client-Name": this.manager.options.clientName || "Moonlink.js",
                };
                if (this.manager.options.resume && sessionId) {
                    headers["Session-Id"] = sessionId;
                    this.manager.emit("debug", `NyxLink > Node > Connect > Resuming a stored session for ${this.identifier}`);
                }
                this.manager.emit("debug", `NyxLink > Node >> WebSocket handshake prepared for ${this.identifier}. Resume: ${Boolean(headers["Session-Id"])}.`);
                const socket = new (Util_1.Structure.get("WebSocket"))(`ws${this.secure ? "s" : ""}://${this.address}/${this.pathVersion}/websocket`, {
                    headers,
                });
                this.socket = socket;
                socket.on('open', () => { if (this.socket === socket && !this.destroyed)
                    void this.open(); });
                socket.on('close', event => { if (this.socket === socket && !this.destroyed)
                    void this.close(event); });
                socket.on('message', event => { if (this.socket === socket && !this.destroyed)
                    void this.message(event); });
                socket.on('error', event => { if (this.socket === socket && !this.destroyed)
                    this.error(event); });
            }
            finally {
                this.connecting = false;
            }
        });
    }
    calculateReconnectDelay() {
        return (0, RetryDelay_1.retryDelay)(this.retryDelay, this.reconnectAttempts, this.retryJitter, 300000);
    }
    async probe() {
        if (this.destroyed || this.manager.destroyed || !this.connected)
            return false;
        const socket = this.socket;
        const session = this.sessionId;
        const previousStats = this.stats;
        const previousTimestamp = this.statsReceivedAt;
        try {
            const stats = await this.rest.getStats();
            if (!stats || this.destroyed || this.manager.destroyed || !this.connected ||
                this.socket !== socket || this.sessionId !== session)
                return false;
            if (this.stats === previousStats && this.statsReceivedAt === previousTimestamp) {
                this.stats = stats;
                this.statsReceivedAt = Date.now();
            }
            return this.circuit.state === 'closed';
        }
        catch {
            return false;
        }
    }
    reconnect() {
        if (this.destroyed || this.reconnectTimeout || !Number.isInteger(this.retryAmount) || this.reconnectAttempts >= this.retryAmount)
            return;
        this.setState(types_1.NodeState.CONNECTING);
        if (this.destroyed)
            return;
        this.manager.emit('nodeReconnecting', this, this.reconnectAttempts + 1);
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = undefined;
            if (this.destroyed)
                return;
            this.reconnectAttempts++;
            void this.connect().catch(error => {
                this.error({ error });
                void this.close({ code: 1006, reason: error.message });
            });
        }, this.calculateReconnectDelay());
    }
    resetResumeUpdateState() {
        this.resumeUpdateAttempts = 0;
        this.resumeUpdateInProgress = false;
        if (this.resumeUpdateTimeout) {
            clearTimeout(this.resumeUpdateTimeout);
            this.resumeUpdateTimeout = undefined;
        }
    }
    cancelResumeWindow() {
        this.resumeWindowActive = false;
        if (this.resumeWindowTimeout) {
            clearTimeout(this.resumeWindowTimeout);
            this.resumeWindowTimeout = undefined;
        }
    }
    startResumeWindow() {
        if (!this.manager.options.resume)
            return;
        this.cancelResumeWindow();
        this.resumeWindowActive = true;
        const windowMs = Math.max(15000, Math.min(this.resumeTimeout, 30000));
        this.resumeWindowTimeout = setTimeout(() => {
            this.resumeWindowTimeout = undefined;
            this.resumeWindowActive = false;
            if (this.pendingRecovery && !this.recoveryInProgress) {
                if (this.state !== types_1.NodeState.READY) {
                    this.manager.emit("debug", `Moonlink.js > Node >> Resume window expired for ${this.identifier}, waiting for READY before recovery.`);
                    return;
                }
                this.startDisasterRecovery("resume window expired");
            }
        }, windowMs);
    }
    scheduleResumeUpdateRetry(delayMs) {
        if (this.destroyed || !this.connected)
            return;
        if (this.resumeUpdateTimeout) {
            clearTimeout(this.resumeUpdateTimeout);
        }
        this.resumeUpdateTimeout = setTimeout(() => {
            this.resumeUpdateTimeout = undefined;
            void this.enableResumeWithRetry();
        }, delayMs);
    }
    async enableResumeWithRetry() {
        if (this.destroyed || !this.connected || !this.manager.options.resume)
            return;
        if (!this.sessionId)
            return;
        if (this.resumeUpdateInProgress)
            return;
        this.resumeUpdateInProgress = true;
        const sessionId = this.sessionId;
        const socket = this.socket;
        const active = () => !this.destroyed && this.connected && this.socket === socket && this.sessionId === sessionId;
        try {
            const response = await this.rest.updateSession(this.manager.options.resume, this.resumeTimeout / 1000);
            if (response == null || response.resuming !== this.manager.options.resume) {
                throw new Error('Backend did not confirm resume configuration');
            }
            if (!active())
                return;
            this.resetResumeUpdateState();
            this.manager.emit("debug", `Moonlink.js > Node > Resume enabled for session ${this.sessionId} on ${this.identifier}.`);
        }
        catch (error) {
            if (!active())
                return;
            this.resumeUpdateAttempts++;
            const attempt = this.resumeUpdateAttempts;
            const delay = Math.min(this.resumeUpdateBaseDelay * Math.pow(1.5, attempt - 1), 30000);
            this.manager.emit("debug", `Moonlink.js > Node > Failed to enable resume for ${this.identifier} (attempt ${attempt}/${this.resumeUpdateMaxAttempts}). Retrying in ${Math.round(delay / 1000)}s. Error: ${error instanceof Error ? error.message : String(error)}`);
            if (attempt < this.resumeUpdateMaxAttempts) {
                this.scheduleResumeUpdateRetry(delay);
            }
        }
        finally {
            if (active())
                this.resumeUpdateInProgress = false;
        }
    }
    async startDisasterRecovery(reason) {
        if (this.recoveryInProgress)
            return;
        this.recoveryInProgress = true;
        this.pendingRecovery = false;
        const notify = (callback) => {
            try {
                callback();
            }
            catch (error) {
                try {
                    this.manager.emit("nodeError", this, error instanceof Error ? error : new Error(String(error)));
                }
                catch { }
            }
        };
        try {
            notify(() => this.manager.emit("debug", `Moonlink.js > Node >> Session not resumed for node ${this.identifier}. Starting disaster recovery (${reason}).`));
            const playersOnNode = this.manager.players.filter(player => player.node === this);
            await Promise.all(playersOnNode.map(async (player) => {
                const active = () => !this.destroyed && !player.destroyed && player.node === this;
                if (!active())
                    return;
                notify(() => this.manager.emit('playerRecoveryStarted', player));
                if (!active())
                    return;
                let success = false;
                try {
                    success = await player.restart({ startQueued: false });
                }
                catch (error) {
                    notify(() => this.manager.emit('nodeError', this, error instanceof Error ? error : new Error(String(error))));
                }
                if (active())
                    notify(() => this.manager.emit(success ? 'playerRecoverySuccess' : 'playerRecoveryFailed', player));
            }));
        }
        finally {
            this.recoveryInProgress = false;
        }
    }
    invalidateBackendRefresh() {
        this.backendGeneration++;
        this.backendRefresh = undefined;
        this.sourceHealth.clear();
    }
    clearBackendMetadata() {
        this.isNodeLink = false;
        this.backend = undefined;
        this.capabilities = new Set();
        this.info = undefined;
        this.version = undefined;
        this.backendRefreshedAt = undefined;
    }
    refreshBackend() {
        if (this.destroyed || this.manager.destroyed || !this.connected)
            return Promise.resolve(false);
        if (this.backendRefresh)
            return this.backendRefresh;
        const generation = this.backendGeneration;
        const socket = this.socket;
        const current = () => !this.destroyed && !this.manager.destroyed && this.connected &&
            this.backendGeneration === generation && this.socket === socket;
        const operation = Promise.resolve().then(() => (0, OpenTelemetry_1.observeOperation)(this.manager, 'nyxlink.capabilities', async () => {
            if (!current())
                return false;
            try {
                const result = await this.rest.getInfoWithHeaders();
                if (!current() || !result)
                    return false;
                const capabilities = new Set();
                const adapter = BackendDetector_1.BackendDetector.detect(result.data, result.headers, capabilities);
                if (!adapter)
                    return false;
                this.backend = adapter;
                this.capabilities = capabilities;
                this.isNodeLink = adapter.kind === 'nodelink';
                this.info = result.data;
                this.version = adapter.version;
                this.backendRefreshedAt = Date.now();
                return true;
            }
            catch (error) {
                if (current())
                    this.manager.emit('debug', `NyxLink > Node > Backend metadata refresh failed for ${this.identifier}`);
                return false;
            }
        }, result => result ? 'success' : 'resolved')).finally(() => {
            if (this.backendRefresh === operation)
                this.backendRefresh = undefined;
        });
        this.backendRefresh = operation;
        return operation;
    }
    async open() {
        if (this.destroyed || this.manager.destroyed)
            return;
        this.invalidateBackendRefresh();
        const generation = this.backendGeneration;
        const socket = this.socket;
        if (this.reconnectTimeout)
            clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = undefined;
        this.stats = undefined;
        this.statsReceivedAt = undefined;
        this.clearBackendMetadata();
        this.connected = true;
        this.setState(types_1.NodeState.CONNECTED);
        const current = () => !this.destroyed && !this.manager.destroyed && this.connected &&
            this.backendGeneration === generation && this.socket === socket;
        if (!current())
            return;
        if (this.readyTimeout)
            clearTimeout(this.readyTimeout);
        this.readyTimeout = setTimeout(() => {
            if (!current())
                return;
            this.readyTimeout = undefined;
            if (this.state !== types_1.NodeState.READY)
                socket?.close(1011, 'No valid ready payload');
        }, this.readyTimeoutMs);
        this.readyTimeout.unref();
        this.backendReady = this.refreshBackend().then(() => {
            if (current())
                this.manager.emit('nodeConnected', this);
        });
        await this.backendReady;
    }
    async close(event) {
        if (this.destroyed || (this.state === types_1.NodeState.DISCONNECTED && !this.connected))
            return;
        this.invalidateBackendRefresh();
        const closeGeneration = this.backendGeneration;
        const closingSocket = this.socket;
        this.socket = null;
        const notify = (callback) => {
            try {
                callback();
            }
            catch (error) {
                try {
                    this.manager.emit("nodeError", this, error instanceof Error ? error : new Error(String(error)));
                }
                catch { }
            }
        };
        const closingThisConnection = () => !this.destroyed &&
            this.backendGeneration === closeGeneration && !this.connected &&
            this.state === types_1.NodeState.DISCONNECTED;
        this.clearVoiceReconnects();
        if (this.readyTimeout)
            clearTimeout(this.readyTimeout);
        this.readyTimeout = undefined;
        const { code, reason } = event;
        if (this.connected)
            this.connected = false;
        notify(() => this.setState(types_1.NodeState.DISCONNECTED));
        this.resetResumeUpdateState();
        notify(() => this.manager.emit("debug", `Moonlink.js > Node <- Disconnected from ${this.identifier}. Code: ${code}, Reason: ${reason}.`));
        try {
            closingSocket?.close();
        }
        catch (error) {
            notify(() => this.manager.emit("nodeError", this, error instanceof Error ? error : new Error(String(error))));
        }
        notify(() => this.manager.emit("nodeDisconnect", this, code, reason));
        if (!closingThisConnection())
            return;
        if (this.reconnectTimeout)
            clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = undefined;
        let orphanedPlayers = this.manager.players.filter((p) => p.node === this);
        let moved = false;
        if (orphanedPlayers.length > 0 && this.manager.options.node?.autoMovePlayers) {
            const transfers = await Promise.all(orphanedPlayers.map(async (player) => {
                try {
                    return await NodeFailover_1.NodeFailover.move(player, this);
                }
                catch (error) {
                    const failure = error instanceof Error ? error : new Error(String(error));
                    notify(() => this.manager.emit("nodeError", this, failure));
                    return { status: 'failed', attempts: 0 };
                }
            }));
            const destinations = new Map();
            orphanedPlayers.forEach((player, index) => {
                const result = transfers[index];
                if (result.status === 'recovered' && result.node && !player.destroyed &&
                    player.node === result.node && result.node !== this &&
                    result.node.connected && !result.node.destroyed) {
                    const group = destinations.get(result.node) ?? [];
                    group.push(player);
                    destinations.set(result.node, group);
                }
            });
            for (const [target, players] of destinations) {
                notify(() => this.manager.emit('playersMoved', players, this, target));
            }
            orphanedPlayers = orphanedPlayers.filter(player => !player.destroyed && (player.node === this ||
                !player.node.connected || player.node.destroyed));
            moved = orphanedPlayers.length === 0;
        }
        if (!closingThisConnection())
            return;
        if (this.authenticationFailed)
            this.reconnectAttempts = this.retryAmount;
        if (this.reconnectAttempts >= this.retryAmount) {
            if (!moved && orphanedPlayers.length > 0) {
                this.manager.emit("debug", `Moonlink.js > Node >> Node disconnected permanently. Destroying ${orphanedPlayers.length} players.`);
                if (!this.manager.options.node?.failover?.preserveOnFailure) {
                    for (const player of orphanedPlayers) {
                        try {
                            await player.destroy("Node disconnected permanently");
                        }
                        catch (error) {
                            const failure = error instanceof Error ? error : new Error(String(error));
                            try {
                                this.manager.emit("nodeError", this, failure);
                            }
                            catch { }
                        }
                    }
                }
                notify(() => this.manager.emit("playersOrphaned", orphanedPlayers, this));
            }
            if (this.reconnectAttempts >= this.retryAmount && closingThisConnection()) {
                await this.destroy();
            }
        }
        else {
            if (!moved && orphanedPlayers.length > 0 && this.manager.options.resume) {
                this.pendingRecovery = true;
                this.startResumeWindow();
            }
            if (!moved && orphanedPlayers.length > 0) {
                this.manager.emit("debug", `Moonlink.js > Node >> Node disconnected (Code ${code}). Attempting reconnect. Keeping ${orphanedPlayers.length} players waiting for resume.`);
            }
            this.reconnect();
        }
    }
    async message({ data }) {
        if (this.destroyed)
            return;
        let payload;
        try {
            payload = JSON.parse(typeof data === 'string' ? data : data.toString('utf8'));
        }
        catch (e) {
            this.manager.emit("debug", `NyxLink > Node > Rejected malformed payload from ${this.identifier}.`);
            return;
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.op !== 'string')
            return;
        const messageSocket = this.socket;
        const messageGeneration = this.backendGeneration;
        this.manager.emit("nodeRaw", this, payload);
        if (payload.op === 'event' && (payload.type === 'SourceHealthSnapshotEvent' || payload.type === 'SourceHealthChangeEvent')) {
            await this.backendReady;
            if (this.destroyed || this.manager.destroyed || !this.connected || !this.isNodeLink ||
                this.socket !== messageSocket || this.backendGeneration !== messageGeneration)
                return;
            let event;
            try {
                event = this.sourceHealth.apply(payload);
            }
            catch {
                this.manager.emit('debug', `NyxLink > Node > Rejected invalid source health event from ${this.identifier}.`);
                return;
            }
            if (event?.type === 'SourceHealthSnapshotEvent')
                this.manager.emit('sourceHealthSnapshot', this, event);
            else if (event?.type === 'SourceHealthChangeEvent')
                this.manager.emit('sourceHealthChange', this, event);
            return;
        }
        const player = this.manager.players.get(payload.guildId);
        if (player && (player.destroyed || player.node !== this))
            return;
        if (!player && payload.guildId) {
            this.manager.emit("debug", `Moonlink.js > Node >> Payload for non-existent player. GuildId: ${payload.guildId}, OP: ${payload.op}.`);
            return;
        }
        let loggedByCase = false;
        switch (payload.op) {
            case "ready":
                if (typeof payload.sessionId !== 'string' || !payload.sessionId || typeof payload.resumed !== 'boolean')
                    return;
                const readySocket = this.socket;
                const readyGeneration = this.backendGeneration;
                await this.backendReady;
                if (this.destroyed || !this.connected || this.socket !== readySocket || this.backendGeneration !== readyGeneration)
                    return;
                this.manager.emit("debug", `NyxLink > Node >> READY for ${this.identifier}. Resumed: ${payload.resumed}.`);
                this.sessionId = payload.sessionId;
                this.resumed = payload.resumed;
                this.reconnectAttempts = 0;
                if (this.readyTimeout)
                    clearTimeout(this.readyTimeout);
                this.readyTimeout = undefined;
                this.setState(types_1.NodeState.READY);
                if (this.destroyed || !this.connected)
                    return;
                await this.manager.database.set(this.sessionStoragePath, {
                    sessionId: this.sessionId,
                });
                if (this.destroyed || !this.connected || this.socket !== readySocket || this.backendGeneration !== readyGeneration)
                    return;
                if (this.manager.options.resume) {
                    void this.enableResumeWithRetry();
                }
                this.manager.emit("nodeReady", this, payload);
                if (this.manager.options.resume) {
                    if (this.resumed) {
                        this.manager.emit("nodeResume", this);
                        this.pendingRecovery = false;
                        this.cancelResumeWindow();
                        this._resumePlayers();
                    }
                    else {
                        this.pendingRecovery = true;
                        if (!this.resumeWindowActive) {
                            void this.startDisasterRecovery("resume not confirmed");
                        }
                        else {
                            this.manager.emit("debug", `Moonlink.js > Node >> Resume window active for ${this.identifier}; delaying recovery.`);
                        }
                    }
                }
                loggedByCase = true;
                break;
            case "stats":
                delete payload.op;
                this.stats = payload;
                this.statsReceivedAt = Date.now();
                if (!this.lastStats ||
                    this.stats.players !== this.lastStats.players ||
                    this.stats.playingPlayers !== this.lastStats.playingPlayers) {
                    this.lastStats = {
                        players: this.stats.players,
                        playingPlayers: this.stats.playingPlayers,
                    };
                    this.manager.emit("debug", `Moonlink.js > Node <- Node ${this.identifier} STATS updated. Stats: ${(0, Util_1.stringifyWithReplacer)(this.stats)}.`);
                }
                loggedByCase = true;
                break;
            case "playerUpdate":
                if (!player) {
                    loggedByCase = true;
                    break;
                }
                const currentState = payload.state;
                const lastState = player.get("lastState");
                player.connected = currentState.connected;
                player.ping = currentState.ping;
                if (player.current) {
                    const shouldPreservePosition = Boolean(!currentState.connected &&
                        lastState?.connected &&
                        lastState.position > 0);
                    if (!shouldPreservePosition || currentState.position > 0) {
                        player.current.position = currentState.position;
                        player.current.time = currentState.time;
                        player.updateData("current.position", currentState.position);
                    }
                    if (shouldPreservePosition && lastState) {
                        player.set("lastKnownPosition", lastState.position);
                    }
                }
                const positionAdvanced = Boolean(!lastState || currentState.position > lastState.position);
                if (player.playing && !player.paused && currentState.connected && positionAdvanced) {
                    player.updateActivity();
                }
                let logMessage = `Moonlink.js > Node#handleMessage >> Player ${player.guildId} state updated. CurrentState: ${(0, Util_1.stringifyWithReplacer)(currentState)}.`;
                let shouldLog = false;
                if (!lastState) {
                    shouldLog = true;
                    logMessage += ` Initial state: ${(0, Util_1.stringifyWithReplacer)(currentState)} (skipping all normal logs).`;
                }
                else {
                    if (currentState.connected !== lastState.connected) {
                        shouldLog = true;
                        logMessage += ` Connection status changed from ${lastState.connected} to ${currentState.connected}.`;
                    }
                    if (currentState.ping !== -1) {
                        if (currentState.ping > 1000 && currentState.ping !== lastState.ping) {
                            shouldLog = true;
                            logMessage += ` High ping detected: ${currentState.ping}ms.`;
                        }
                        else if (lastState.ping &&
                            lastState.ping !== -1 &&
                            Math.abs(currentState.ping - lastState.ping) > 500) {
                            shouldLog = true;
                            logMessage += ` Significant ping change: ${lastState.ping}ms -> ${currentState.ping}ms.`;
                        }
                    }
                    if (player.playing && player.current) {
                        if (currentState.position === 0 && lastState.position !== 0) {
                            shouldLog = true;
                            logMessage += ` Position reset to 0 while playing.`;
                        }
                        else if (currentState.position === lastState.position &&
                            currentState.position !== 0) {
                            shouldLog = true;
                            logMessage += ` Position stuck at ${currentState.position}ms while playing.`;
                        }
                    }
                }
                if (shouldLog) {
                    this.manager.emit("debug", logMessage);
                }
                loggedByCase = true;
                player.set("lastState", {
                    connected: currentState.connected,
                    position: currentState.position,
                    ping: currentState.ping,
                    time: currentState.time,
                });
                this.manager.emit("playerUpdate", player, player.current ?? null, payload);
                player.voice.check(currentState.connected);
                player.requestQueuePreload?.();
                break;
            case "event":
                if (payload.type === "WorkerFailedEvent") {
                    void this.handleWorkerFailed(payload).catch(() => {
                        if (!this.destroyed)
                            this.manager.emit("debug", `NyxLink > Worker recovery handler rejected on ${this.identifier}.`);
                    });
                    loggedByCase = true;
                    break;
                }
                if (!player) {
                    loggedByCase = true;
                    break;
                }
                this.manager.emit("debug", `Moonlink.js > Node <- Player ${player.guildId} received event. Type: ${payload.type}, Payload: ${(0, Util_1.stringifyWithReplacer)(payload)}.`);
                this.handleEvent(player, payload);
                loggedByCase = true;
                break;
            default:
                if (!loggedByCase) {
                    this.manager.emit("debug", `Moonlink.js > Node <- Received unhandled payload from ${this.identifier}. OP: ${payload.op}, Data: ${(0, Util_1.stringifyWithReplacer)(payload)}.`);
                }
                loggedByCase = true;
                break;
        }
    }
    handleEvent(player, payload) {
        if (player.destroyed || player.node !== this)
            return;
        switch (payload.type) {
            case "TrackStartEvent":
                this.handleTrackStart(player, payload);
                break;
            case "TrackEndEvent":
                this.handleTrackEnd(player, payload);
                break;
            case "TrackStuckEvent":
                if (payload.track && !(0, PlaybackAttempt_1.playbackAttempt)(player).accepts(this, payload.track))
                    return;
                this.handleTrackStuck(player, payload);
                break;
            case "TrackExceptionEvent":
                if (payload.track && !(0, PlaybackAttempt_1.playbackAttempt)(player).accepts(this, payload.track))
                    return;
                this.handleTrackException(player, payload);
                break;
            case "MixStartedEvent":
                this.handleMixStarted(player, payload);
                break;
            case "MixEndedEvent":
                this.handleMixEnded(player, payload);
                break;
            case "ConnectionStatusEvent":
                this.handleConnectionStatus(player, payload);
                break;
            case "VolumeChangedEvent":
                this.handleVolumeChanged(player, payload);
                break;
            case "FiltersChangedEvent":
                this.handleFiltersChanged(player, payload);
                break;
            case "SeekEvent":
                this.handleSeek(player, payload);
                break;
            case "PauseEvent":
                this.handlePause(player, payload);
                break;
            case "PlayerCreatedEvent":
                this.handlePlayerCreated(player, payload);
                break;
            case "PlayerDestroyedEvent":
                this.handlePlayerDestroyed(player, payload);
                break;
            case "PlayerReconnectingEvent":
                this.handlePlayerReconnecting(player, payload);
                break;
            case "PlayerConnectedEvent":
                this.handlePlayerConnected(player, payload);
                break;
            case "EternalBoxInfoEvent":
                this.handleEternalBoxInfo(player, payload);
                break;
            case "EternalBoxJumpEvent":
                this.handleEternalBoxJump(player, payload);
                break;
            case "StreamMetadataEvent":
                this.handleStreamMetadata(player, payload);
                break;
            case "LyricsFoundEvent":
                this.handleLyricsFound(player, payload);
                break;
            case "LyricsLineEvent":
                this.handleLyricsLine(player, payload);
                break;
            case "LyricsNotFoundEvent":
                this.handleLyricsNotFound(player, payload);
                break;
            case "WebSocketClosedEvent":
                void this.handleWebSocketClosed(player, payload).catch(() => {
                    if (!this.destroyed)
                        this.manager.emit("debug", `NyxLink > Voice close recovery rejected on ${this.identifier}.`);
                });
                break;
        }
    }
    async handleWorkerFailed(payload) {
        const affectedGuilds = [...new Set((Array.isArray(payload.affectedGuilds) ? payload.affectedGuilds : [])
                .filter((id) => typeof id === "string" && /^[0-9]{17,20}$/.test(id)))];
        this.manager.emit("debug", `NyxLink > WorkerFailedEvent on ${this.identifier}: ${affectedGuilds.length} valid guild(s).`);
        const session = this.sessionId;
        const socket = this.socket;
        const generation = this.backendGeneration;
        for (const guildId of affectedGuilds) {
            const player = this.manager.players.get(guildId);
            if (!player)
                continue;
            const guard = (0, PlaybackGuard_1.playbackGuard)(player);
            const ticket = guard.ticket;
            const active = () => !this.destroyed && this.connected && !this.manager.destroyed &&
                this.sessionId === session && this.socket === socket && this.backendGeneration === generation &&
                !player.destroyed && this.manager.players.get(guildId) === player &&
                player.node === this && guard.isCurrent(ticket);
            if (!active())
                continue;
            if (player.get("voiceCloseRecoveryInProgress")) {
                this.manager.emit("debug", `NyxLink > Worker recovery already active for ${guildId}.`);
                continue;
            }
            await (0, VoiceRecovery_1.recoverVoicePlayer)(this, player, active, {
                label: 'Worker', destroyReason: 'Worker failed recovery failed',
            });
        }
    }
    async handleTrackStart(player, payload) {
        const incoming = payload.track ?? player.current?.toJSON?.();
        if (!incoming)
            return;
        const attempts = (0, PlaybackAttempt_1.playbackAttempt)(player);
        const started = attempts.start(this, incoming);
        if (!started)
            return;
        const trackData = attempts.clean(incoming);
        if (started === 'preloaded') {
            player.consumePreloadedTrack();
            player.current = new (Util_1.Structure.get("Track"))(trackData, trackData.userData?.requester ?? player.current?.requester, undefined, this.manager.options.trackPartial ?? []);
            player.updateData('current', TrackCodec_1.TrackCodec.serialize(player.current));
        }
        const trackTitle = trackData?.info?.title ?? player.current?.title ?? "Unknown";
        this.manager.emit("debug", `Moonlink.js > Node#handleTrackStart >> Track started for player ${player.guildId}: "${trackTitle}". Track: ${(0, Util_1.stringifyWithReplacer)(trackData ?? payload.track)}.`);
        player.playing = true;
        const restoring = attempts.isRestoring();
        if (!restoring)
            player.paused = false;
        player.updateActivity();
        player.set("lastKnownPosition", null);
        if (player.current && !restoring) {
            player.current.position = 0;
        }
        const reconnectAttempts = player.get("reconnectAttempts");
        if (reconnectAttempts && reconnectAttempts > 0) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackStart >> Player ${player.guildId} successfully recovered after ${reconnectAttempts} reconnect attempts.`);
            player.set("reconnectAttempts", 0);
        }
        this.manager.emit("debug", `Moonlink.js > Node#handleTrackStart >> Resetting player state (stuckCount, exceptionCount, isResuming) for player ${player.guildId}.`);
        player.set("stuckCount", 0);
        player.set("exceptionCount", 0);
        player.isResuming = false;
        if (!trackData) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackStart >> Missing track data for player ${player.guildId}. Payload: ${(0, Util_1.stringifyWithReplacer)(payload)}.`);
            return;
        }
        if (player.current && (!trackData.userData || Object.keys(trackData.userData).length === 0)) {
            trackData.userData = player.current.userData;
        }
        const trackForEvent = new (Util_1.Structure.get("Track"))(trackData, player.current?.requester, undefined, this.manager.options.trackPartial ?? []);
        this.manager.emit("trackStart", player, trackForEvent);
        player.requestQueuePreload?.();
    }
    async handleTrackEnd(player, payload) {
        const { reason } = payload;
        const isCrossfadeTransition = reason === "crossfading";
        const isGaplessTransition = reason === "gapless";
        if (reason === "replaced") {
            return;
        }
        const incoming = payload.track ?? player.current?.toJSON?.();
        if (!incoming || !(0, PlaybackAttempt_1.playbackAttempt)(player).end(this, incoming))
            return;
        const trackData = (0, PlaybackAttempt_1.playbackAttempt)(player).clean(incoming);
        if (trackData && player.current && (!trackData.userData || Object.keys(trackData.userData).length === 0)) {
            trackData.userData = player.current.userData;
        }
        const trackForEvent = trackData
            ? new (Util_1.Structure.get("Track"))(trackData, player.current?.requester, undefined, this.manager.options.trackPartial ?? [])
            : player.current;
        const intent = (0, PlaybackGuard_1.playbackGuard)(player).ticket;
        if (!isCrossfadeTransition && !isGaplessTransition) {
            player.playing = false;
            player.paused = false;
            player.updateActivity();
            player.set("lastKnownPosition", null);
            player.set("isBackPlay", false);
        }
        if (trackForEvent) {
            this.manager.emit("trackEnd", player, trackForEvent, reason, payload);
        }
        else {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd >> Missing track data for player ${player.guildId}. Payload: ${(0, Util_1.stringifyWithReplacer)(payload)}.`);
        }
        if (player.destroyed) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd >> Player ${player.guildId} is destroyed, skipping end handling.`);
            return;
        }
        if (!(0, PlaybackGuard_1.playbackGuard)(player).isCurrent(intent))
            return;
        if (isCrossfadeTransition || isGaplessTransition) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd >> Track ended due to ${reason} for player ${player.guildId}. Skipping queue/autoplay logic.`);
            return;
        }
        if (reason === "loadFailed") {
            const trackHandling = this.manager.options.trackHandling;
            const trackToRetry = player.current;
            if (trackHandling?.retryFailedTracks && trackToRetry) {
                const maxRetries = trackHandling.maxRetryAttempts ?? 3;
                if (trackToRetry.retries < maxRetries) {
                    trackToRetry.retries++;
                    this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd >> Track failed to load. Retrying... (Attempt ${trackToRetry.retries}/${maxRetries}) for player ${player.guildId}.`);
                    player.queue.unshift(trackToRetry);
                    await player.play();
                    return;
                }
                this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd >> Track failed to load after ${maxRetries} attempts for player ${player.guildId}.`);
            }
        }
        if (reason === "stopped" || reason === "cleanup") {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd >> Track was ${reason}, skipping queue logic for player ${player.guildId}.`);
            return;
        }
        if (reason === "finished" && player.loop === "track" && player.current) {
            this.manager.emit("debug", `NyxLink > Node#handleTrackEnd >> Replaying looped track for player ${player.guildId}.`);
            await player.replay();
            return;
        }
        if (reason === "finished" && player.loop === "queue" && player.current) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd >> Player ${player.guildId} is in queue loop mode. Adding current track to the end of the queue: ${player.current.title}.`);
            const loopTrack = player.current.clone();
            loopTrack.position = 0;
            player.queue.add(loopTrack);
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd << Queue size is now ${player.queue.size}.`);
        }
        if (player.queue.size > 0) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd -> Playing next track from queue for player ${player.guildId} (${player.queue.size} tracks remaining).`);
            await player.play();
            return;
        }
        this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd >> Queue is empty for player ${player.guildId}. Proceeding to autoplay check.`);
        if (player.autoPlay && trackForEvent) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd -> Attempting autoPlay for player ${player.guildId}. Previous track: ${trackForEvent.title}.`);
            const autoplay = this.handleAutoPlay(player, trackForEvent);
            const ticket = (0, PlaybackGuard_1.playbackGuard)(player).ticket;
            const automaticTicket = (0, PlaybackGuard_1.playbackGuard)(player).automaticTicket;
            const autoplayed = await autoplay;
            if (!(0, PlaybackGuard_1.playbackGuard)(player).isCurrent(ticket) && !autoplayed)
                return;
            if (!(0, PlaybackGuard_1.playbackGuard)(player).isAutoCurrent(automaticTicket) && !autoplayed)
                return;
            if (!autoplayed && player.playing && player.current?.encoded !== trackForEvent?.encoded)
                return;
            if (autoplayed) {
                this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd << AutoPlay was successful for player ${player.guildId}.`);
                return;
            }
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd >> AutoPlay failed for player ${player.guildId}.`);
        }
        else if (player.autoPlay) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackEnd >> AutoPlay skipped for player ${player.guildId} due to missing previous track data.`);
        }
        if (player.queue.size > 0) {
            await player.play();
            return;
        }
        await this.handleQueueEnd(player, trackForEvent, intent);
    }
    async handleTrackStuck(player, payload) {
        if (payload.track?.encoded && payload.track.encoded !== player.current?.encoded)
            return;
        const track = player.current;
        const ticket = (0, PlaybackGuard_1.playbackGuard)(player).ticket;
        const unchanged = () => !player.destroyed && player.node === this &&
            player.current === track && (0, PlaybackGuard_1.playbackGuard)(player).isCurrent(ticket);
        const thresholdMs = payload.thresholdMs;
        this.manager.emit("debug", `Moonlink.js > Node#handleTrackStuck >> Track stuck for player ${player.guildId}: "${track?.title}". Threshold: ${thresholdMs}ms. Payload: ${(0, Util_1.stringifyWithReplacer)(payload)}.`);
        this.manager.emit("trackStuck", player, track, thresholdMs, payload);
        if (!track || !unchanged())
            return;
        if (track && track.duration === -1) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackStuck >> Track has -1 duration (stream?), skipping auto-recovery to prevent loops for player ${player.guildId}.`);
            return;
        }
        if (this.manager.options.trackHandling?.skipStuckTracks) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackStuck >> 'skipStuckTracks' is true, skipping track for player ${player.guildId}.`);
            await player.skip();
            return;
        }
        const stuckCount = (player.get("stuckCount") || 0) + 1;
        player.set("stuckCount", stuckCount);
        if (stuckCount >= 3) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackStuck >> Track stuck ${stuckCount} times for player ${player.guildId}, skipping track.`);
            player.set("stuckCount", 0);
            if (player.queue.size > 0) {
                this.manager.emit("debug", `Moonlink.js > Node#handleTrackStuck -> Skipping to next track for player ${player.guildId}.`);
                await player.skip();
            }
            else {
                this.manager.emit("debug", `Moonlink.js > Node#handleTrackStuck -> No tracks in queue, stopping player ${player.guildId}.`);
                await player.stop();
                this.manager.emit("queueEnd", player, track);
            }
        }
        else {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackStuck -> Attempting to restart playback for player ${player.guildId} (attempt ${stuckCount}/3).`);
            try {
                const currentPosition = player.current?.position || 0;
                this.manager.emit("debug", `Moonlink.js > Node#handleTrackStuck -> Seeking player ${player.guildId} to position ${currentPosition + 1000}ms.`);
                await player.seek(currentPosition + 1000);
                this.manager.emit("debug", `Moonlink.js > Node#handleTrackStuck >> Seeked forward 1s for player ${player.guildId}.`);
            }
            catch (error) {
                if (!unchanged())
                    return;
                this.manager.emit("debug", `NyxLink > Node#handleTrackStuck >> Failed to seek, attempting full restart for player ${player.guildId}. Error: ${error instanceof Error ? error.message : String(error)}.`);
                await player.restart();
            }
        }
    }
    async handleTrackException(player, payload) {
        if (payload.track?.encoded && payload.track.encoded !== player.current?.encoded)
            return;
        const track = player.current;
        const ticket = (0, PlaybackGuard_1.playbackGuard)(player).ticket;
        const unchanged = () => !player.destroyed && player.node === this &&
            player.current === track && (0, PlaybackGuard_1.playbackGuard)(player).isCurrent(ticket);
        const exception = payload.exception;
        this.manager.emit("debug", `Moonlink.js > Node#handleTrackException >> Track exception for player ${player.guildId}: "${track?.title}". Severity: ${exception.severity}. Message: ${exception.message}. Payload: ${(0, Util_1.stringifyWithReplacer)(payload)}.`);
        this.manager.emit("trackException", player, track, exception, payload);
        if (!track || !unchanged())
            return;
        if (this.manager.options.trackHandling?.autoSkipOnError) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackException >> 'autoSkipOnError' is true, skipping track for player ${player.guildId}.`);
            await player.skip();
            return;
        }
        const exceptionCount = (player.get("exceptionCount") || 0) + 1;
        player.set("exceptionCount", exceptionCount);
        if (exception.severity === "fault") {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackException >> Fatal exception detected for player ${player.guildId}, skipping track.`);
            if (player.queue.size > 0) {
                await player.skip();
            }
            else {
                await player.stop();
                this.manager.emit("queueEnd", player, track);
            }
            player.set("exceptionCount", 0);
        }
        else if (exception.severity === "suspicious" && exceptionCount >= 2) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackException >> Suspicious exception repeated ${exceptionCount} times for player ${player.guildId}, skipping track.`);
            player.set("exceptionCount", 0);
            if (player.queue.size > 0) {
                await player.skip();
            }
            else {
                await player.stop();
                this.manager.emit("queueEnd", player, track);
            }
        }
        else if (exceptionCount >= 3) {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackException >> Track threw ${exceptionCount} exceptions for player ${player.guildId}, skipping track.`);
            player.set("exceptionCount", 0);
            if (player.queue.size > 0) {
                await player.skip();
            }
            else {
                await player.stop();
                this.manager.emit("queueEnd", player, track);
            }
        }
        else {
            this.manager.emit("debug", `Moonlink.js > Node#handleTrackException -> Exception count: ${exceptionCount}/3 for player ${player.guildId}, continuing playback.`);
        }
    }
    handleMixStarted(player, payload) {
        const trackData = payload.track;
        const mixTrack = new (Util_1.Structure.get("Track"))(trackData, trackData?.userData?.requester, undefined, this.manager.options.trackPartial ?? []);
        this.manager.emit("mixStart", player, payload.mixId, mixTrack, payload.volume, payload);
    }
    handleMixEnded(player, payload) {
        this.manager.emit("mixEnd", player, payload.mixId, payload.reason, payload);
    }
    handleConnectionStatus(player, payload) {
        const statusValue = payload.status ?? payload.connected;
        let connected;
        if (typeof statusValue === "string") {
            connected = statusValue.toLowerCase() === "connected";
        }
        else if (typeof statusValue === "boolean") {
            connected = statusValue;
        }
        if (typeof connected === "boolean") {
            player.connected = connected;
            player.voice.check(connected);
            if (connected) {
                this.manager.emit("playerConnected", player, payload);
            }
            else {
                this.manager.emit("playerDisconnected", player);
            }
        }
        this.manager.emit("playerConnectionStatus", player, statusValue, payload);
    }
    handleVolumeChanged(player, payload) {
        if (typeof payload.volume === "number") {
            const oldVolume = player.volume;
            player.volume = payload.volume;
            player.updateData("volume", player.volume);
            this.manager.emit("playerChangedVolume", player, oldVolume, player.volume);
        }
    }
    handleFiltersChanged(player, payload) {
        const filtersPayload = payload.filters?.filters ?? payload.filters;
        if (filtersPayload && typeof filtersPayload === "object") {
            Object.assign(player.filters, filtersPayload);
            void player.updateData("filters", player.filters.toJSON());
        }
        this.manager.emit("filtersUpdate", player, player.filters);
    }
    handleSeek(player, payload) {
        if (typeof payload.position !== "number")
            return;
        if (player.current) {
            player.current.position = payload.position;
            player.updateData("current.position", payload.position);
        }
        this.manager.emit("playerSeek", player, payload.position, payload);
    }
    handlePause(player, payload) {
        if (typeof payload.paused !== "boolean")
            return;
        player.paused = payload.paused;
        player.updateData("paused", player.paused);
        player.updateActivity();
        this.manager.emit("playerPause", player, payload.paused, payload);
    }
    handlePlayerCreated(player, payload) {
        this.manager.emit("playerCreated", player, payload);
    }
    async handlePlayerDestroyed(player, payload) {
        this.manager.emit("playerDestroyed", player, payload);
        if (!player.destroyed) {
            await player.destroy("Remote player destroyed");
        }
    }
    handlePlayerReconnecting(player, payload) {
        player.isResuming = true;
        this.manager.emit("playerReconnect", player, payload.reason);
    }
    handlePlayerConnected(player, payload) {
        player.isResuming = false;
        player.connected = true;
        this.manager.emit("playerConnected", player, payload);
    }
    handleEternalBoxInfo(player, payload) {
        this.manager.emit("eternalBoxInfo", player, payload);
    }
    handleEternalBoxJump(player, payload) {
        this.manager.emit("eternalBoxJump", player, payload);
    }
    handleStreamMetadata(player, payload) {
        this.manager.emit("streamMetadata", player, payload);
    }
    handleLyricsFound(player, payload) {
        this.manager.emit("lyricsFound", player, payload);
    }
    handleLyricsLine(player, payload) {
        this.manager.emit("lyricsLine", player, payload);
    }
    handleLyricsNotFound(player, payload) {
        this.manager.emit("lyricsNotFound", player, payload);
    }
    cancelVoiceReconnect(player) {
        const timer = this.voiceReconnectTimers.get(player);
        if (timer !== undefined)
            clearTimeout(timer);
        this.voiceReconnectTimers.delete(player);
    }
    clearVoiceReconnects() {
        for (const timer of this.voiceReconnectTimers.values())
            clearTimeout(timer);
        this.voiceReconnectTimers.clear();
    }
    async recoverSpecialVoiceClose(player, code) {
        const guard = (0, PlaybackGuard_1.playbackGuard)(player);
        const ticket = guard.ticket;
        const session = this.sessionId;
        const socket = this.socket;
        const generation = this.backendGeneration;
        const active = () => !this.destroyed && this.connected && !this.manager.destroyed &&
            player.node === this && !player.destroyed &&
            this.manager.players.get(player.guildId) === player &&
            this.sessionId === session && this.socket === socket && this.backendGeneration === generation &&
            guard.isCurrent(ticket);
        await (0, VoiceRecovery_1.recoverVoicePlayer)(this, player, active, {
            label: `Voice close ${code}`, resetReconnectAttempts: true,
            destroyReason: code === 4022 ? 'Voice close 4022 recovery failed' : 'Worker failed (5001) recovery failed',
        });
    }
    async handleWebSocketClosed(player, payload) {
        const { code, reason, byRemote } = payload;
        if (this.destroyed || player.destroyed || player.node !== this)
            return;
        if (player.get("voiceCloseRecoveryInProgress")) {
            this.manager.emit("debug", `Moonlink.js > Node#handleWebSocketClosed >> Voice-close recovery already in progress for player ${player.guildId}, skipping event.`);
            return;
        }
        this.manager.emit("debug", `Moonlink.js > Node#handleWebSocketClosed >> WebSocket closed for player ${player.guildId}. Code: ${code}, Reason: "${reason}", By Remote: ${byRemote}. Payload: ${(0, Util_1.stringifyWithReplacer)(payload)}.`);
        const isMoveCloseCode = code === 4014 || code === 4022;
        if (isMoveCloseCode && (player.voice.isMoving || player.voice.wasRecentlyMoved())) {
            this.manager.emit("debug", `Moonlink.js > Node#handleWebSocketClosed >> Ignoring WebSocket close (${code}) for player ${player.guildId} due to channel move.`);
            return;
        }
        if (code === 4022 || (code === 5001 && this.isNodeLink)) {
            await this.recoverSpecialVoiceClose(player, code);
            return;
        }
        if (player.isResuming) {
            this.manager.emit("debug", `Moonlink.js > Node#handleWebSocketClosed >> Player ${player.guildId} is resuming, ignoring WebSocket close event.`);
            return;
        }
        const fatalCodes = [4004, 4015];
        if (fatalCodes.includes(code)) {
            this.manager.emit("debug", `Moonlink.js > Node#handleWebSocketClosed >> Fatal close code ${code} for player ${player.guildId}, destroying player.`);
            this.manager.emit("socketClosed", player, code, reason, byRemote, payload);
            await player.destroy(`WebSocket closed with fatal code: ${code}`);
            return;
        }
        const voiceOptions = this.manager.options.voiceConnection;
        if (!voiceOptions?.autoReconnect || !player.get("userInitiatedConnect")) {
            this.manager.emit("debug", `Moonlink.js > Node#handleWebSocketClosed >> Auto-reconnect skipped for player ${player.guildId}. (Enabled: ${voiceOptions?.autoReconnect}, UserInitiated: ${player.get("userInitiatedConnect")})`);
            if (!player.get("userInitiatedConnect"))
                await player.destroy("Disconnected by user/kick");
            return;
        }
        if (this.voiceReconnectTimers.has(player))
            return;
        const reconnectAttempts = (player.get("wsReconnectAttempts") || 0) + 1;
        const maxReconnectAttempts = voiceOptions.maxReconnectAttempts ?? 5;
        if (reconnectAttempts > maxReconnectAttempts) {
            this.manager.emit("debug", `Moonlink.js > Node#handleWebSocketClosed >> Max reconnect attempts reached (${maxReconnectAttempts}) for player ${player.guildId}.`);
            this.manager.emit("socketClosed", player, code, reason, byRemote, payload);
            await player.destroy("Max reconnect attempts reached");
            return;
        }
        player.set("wsReconnectAttempts", reconnectAttempts);
        this.manager.emit("debug", `Moonlink.js > Node#handleWebSocketClosed -> Attempting reconnect ${reconnectAttempts}/${maxReconnectAttempts} for player ${player.guildId}.`);
        const reconnectDelay = voiceOptions.reconnectDelay ?? 5000;
        this.manager.emit("debug", `Moonlink.js > Node#handleWebSocketClosed -> Reconnect scheduled in ${reconnectDelay}ms for player ${player.guildId}.`);
        const guard = (0, PlaybackGuard_1.playbackGuard)(player);
        const ticket = guard.ticket;
        const active = () => !this.destroyed && !player.destroyed && player.node === this &&
            guard.isCurrent(ticket) && Boolean(player.get("userInitiatedConnect"));
        const timer = setTimeout(() => {
            this.voiceReconnectTimers.delete(player);
            if (!active() || player.get("voiceCloseRecoveryInProgress"))
                return;
            const recover = async () => {
                player.set("voiceCloseRecoveryInProgress", true);
                try {
                    if (player.playing && player.current) {
                        if (!await player.restart({ destroyOnFailure: false }))
                            throw new Error("Player restart was not acknowledged");
                    }
                    else {
                        await player.connect();
                    }
                    if (!active())
                        return;
                    this.manager.emit("debug", `NyxLink > Node > Voice recovery finished for player ${player.guildId}.`);
                    player.set("wsReconnectAttempts", 0);
                }
                catch (error) {
                    if (!active())
                        return;
                    this.manager.emit("debug", `NyxLink > Node > Reconnect attempt ${reconnectAttempts} failed: ${error.message}`);
                    if (reconnectAttempts >= maxReconnectAttempts) {
                        this.manager.emit("socketClosed", player, code, reason, byRemote, payload);
                        if (active())
                            await player.destroy("All reconnect attempts exhausted");
                    }
                }
                finally {
                    player.set("voiceCloseRecoveryInProgress", false);
                }
            };
            void recover().catch(error => this.manager.emit("nodeError", this, error));
        }, reconnectDelay);
        timer.unref?.();
        this.voiceReconnectTimers.set(player, timer);
    }
    async updateRecommendations(player, track = player.current) {
        return RecommendationResolver_1.RecommendationResolver.update(this, player, track);
    }
    async handleAutoPlay(player, previousTrack) {
        return AutoPlayManager_1.AutoPlayManager.play(this, player, previousTrack);
    }
    async handleQueueEnd(player, lastTrack, ticket = (0, PlaybackGuard_1.playbackGuard)(player).ticket) {
        if (player.destroyed || player.node !== this || player.queue.size > 0 || player.playing ||
            !(0, PlaybackGuard_1.playbackGuard)(player).isCurrent(ticket))
            return;
        this.manager.emit("debug", `NyxLink > Node#handleQueueEnd >> Queue ended for player ${player.guildId}. LastTrack: ${lastTrack?.title || "None"}.`);
        player.current = null;
        player.playing = false;
        player.paused = false;
        this.manager.emit("debug", `NyxLink > Node#handleQueueEnd >> Player state updated for guild ${player.guildId}.`);
        this.manager.emit("queueEnd", player, lastTrack);
        const stillIdle = () => !player.destroyed && player.node === this &&
            (0, PlaybackGuard_1.playbackGuard)(player).isCurrent(ticket) && !player.playing &&
            player.current === null && player.queue.size === 0;
        if (player.autoLeave && stillIdle()) {
            this.manager.emit("autoLeaved", player, lastTrack);
            if (!stillIdle())
                return;
            this.manager.emit("debug", `NyxLink > Node#handleQueueEnd -> AutoLeave enabled, destroying player ${player.guildId}.`);
            await player.destroy("AutoLeave enabled");
        }
    }
    error({ error }) {
        if (error && typeof error === 'object' && 'statusCode' in error && (error.statusCode === 401 || error.statusCode === 403))
            this.authenticationFailed = true;
        const failure = error instanceof Error ? error : new Error(String(error));
        this.manager.emit("debug", `NyxLink > Node > Error on node ${this.identifier}: ${failure.message}`);
        this.manager.emit("nodeError", this, failure);
    }
    async destroy() {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.connected = false;
        this.clearVoiceReconnects();
        if (this.readyTimeout)
            clearTimeout(this.readyTimeout);
        this.readyTimeout = undefined;
        if (this.reconnectTimeout)
            clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = undefined;
        this.cancelResumeWindow();
        this.resetResumeUpdateState();
        this.invalidateBackendRefresh();
        this.clearBackendMetadata();
        const socket = this.socket;
        this.socket = undefined;
        socket?.close();
        this.setState(types_1.NodeState.DESTROYED);
        this.manager.emit('nodeDestroy', this.identifier);
    }
    _resumePlayers() {
        if (this.recoveryInProgress)
            return Promise.resolve();
        return (0, SessionRecovery_1.resumeSessionPlayers)(this);
    }
}
exports.Node = Node;
//# sourceMappingURL=Node.js.map