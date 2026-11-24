"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Manager = void 0;
const SearchService_1 = require("../search/SearchService");
const VoicePacketHandler_1 = require("../entities/VoicePacketHandler");
const Util_1 = require("../Util");
const DatabaseManager_1 = require("../managers/DatabaseManager");
const __1 = require("../..");
const spotify_1 = require("../sources/spotify");
const deezer_1 = require("../sources/deezer");
const AuroraEvents_1 = require("../logging/AuroraEvents");
const ManagerLogRoute_1 = require("../logging/ManagerLogRoute");
const OpenTelemetry_1 = require("../observability/OpenTelemetry");
const ExtensionHost_1 = require("../extensions/ExtensionHost");
const PrivateMetricsServer_1 = require("../observability/PrivateMetricsServer");
const PerformanceMonitor_1 = require("../observability/PerformanceMonitor");
const GuildOwnership_1 = require("../cluster/GuildOwnership");
class Manager extends Util_1.EventEmitter {
    initialized = false;
    options;
    missingSend = () => { throw new Error('No Discord gateway sender configured'); };
    send;
    clientId = "";
    nodes;
    players;
    guildOwnership;
    databaseInstance;
    get database() {
        if (!this.databaseInstance)
            throw new Error('Manager database is not initialized');
        return this.databaseInstance;
    }
    set database(database) { this.databaseInstance = database; }
    aurora;
    telemetry;
    performanceMonitor;
    extensionHost;
    idleCheckInterval;
    initializationPromise;
    shutdownPromise;
    shuttingDown = false;
    connectors = new Set();
    searches;
    privateMetricsServers = new Set();
    get destroyed() { return this.shuttingDown; }
    spotifySource;
    deezerSource;
    get readyNodes() {
        return this.nodes.ready;
    }
    get hasReadyNodes() {
        return this.nodes.hasReady;
    }
    constructor(config) {
        super();
        (0, Util_1.validate)(config, (value) => value != null, "Manager constructor requires a config object.");
        (0, Util_1.validate)(config.nodes, (value) => Array.isArray(value) && value.length > 0, "Manager config requires a non-empty nodes array.");
        (0, Util_1.validate)(config.options, (value) => value == null || (typeof value === "object" && !Array.isArray(value)), "Manager config 'options' must be a plain object if provided.");
        this.send = config.send ?? this.missingSend;
        this.options = {
            clientName: `NyxLink/${__1.version} (https://github.com/SebasLoadJs/NyxLink)`,
            userAgent: `NyxLink/${__1.version} (https://github.com/SebasLoadJs/NyxLink)`,
            noReplace: false,
            resume: true,
            resumeTimeout: 60000,
            customFilters: {},
            ...config.options,
            defaultPlayer: {
                volume: 100,
                autoPlay: false,
                autoLeave: false,
                selfDeaf: true,
                selfMute: false,
                loop: "off",
                historySize: 10,
                ...config.options?.defaultPlayer
            },
            voiceConnection: {
                timeout: 15000,
                maxReconnectAttempts: 3,
                reconnectDelay: 5000,
                autoReconnect: true,
                ...config.options?.voiceConnection
            },
            node: {
                selectionStrategy: "leastLoad",
                retryDelay: 30000,
                retryAmount: 5,
                avoidUnhealthyNodes: false,
                maxCpuLoad: 80,
                maxMemoryUsage: 90,
                ...config.options?.node
            },
            search: {
                defaultPlatform: "youtube",
                resultLimit: 10,
                playlistLoadLimit: 100,
                ...config.options?.search
            },
            queue: {
                maxSize: 1000,
                allowDuplicates: true,
                historyLimit: 10,
                ...config.options?.queue
            },
            sources: {
                disabledSources: [],
                ...config.options?.sources
            },
            spotify: {
                enabled: false,
                ...config.options?.spotify
            },
            deezer: {
                enabled: false,
                ...config.options?.deezer
            },
            playerDestruction: {
                autoDestroyOnIdle: false,
                idleTimeout: 300000,
                ...config.options?.playerDestruction
            },
            trackHandling: {
                autoSkipOnError: false,
                skipStuckTracks: false,
                trackStuckThreshold: 10000,
                retryFailedTracks: false,
                maxRetryAttempts: 3,
                ...config.options?.trackHandling
            },
            playerHealth: {
                checkInterval: 30000,
                silenceTimeout: 120000,
                maxStuckCount: 3,
                maxSilentCount: 2,
                autoRecover: true,
                resumeDebounce: 1000,
                ...config.options?.playerHealth
            },
            database: {
                type: "local",
                ...config.options?.database
            }
        };
        if (Object.hasOwn(config.options ?? {}, 'aurora'))
            throw new TypeError('Use options.logging for Aurora');
        const canonicalLogging = this.options.logging;
        if (canonicalLogging && Object.keys(canonicalLogging).some(key => !['level', 'target', 'categories', 'traceContext'].includes(key)))
            throw new TypeError('Unsupported logging option: use the canonical Aurora configuration');
        this.searches = new SearchService_1.SearchService(this, query => this.resolveNativeSource(query));
        Util_1.Structure.setManager(this);
        this.nodes = new (Util_1.Structure.get("NodeManager"))(this, config.nodes);
        this.players = new (Util_1.Structure.get("PlayerManager"))(this);
        if (this.options.telemetry)
            this.telemetry = new OpenTelemetry_1.OpenTelemetry(this, this.options.telemetry);
        if (canonicalLogging) {
            this.aurora = new AuroraEvents_1.AuroraEvents(canonicalLogging);
            this.aurora.attach(this);
        }
    }
    useGuildLeases(options) {
        if (this.destroyed || this.guildOwnership || this.players.size > 0) {
            throw new Error('Guild leases must be enabled once, before creating players');
        }
        this.guildOwnership = new GuildOwnership_1.GuildOwnership(this, options);
        return this;
    }
    async startPrivateMetricsServer(options) {
        if (this.destroyed)
            throw new Error('Manager is shut down');
        const endpoint = new PrivateMetricsServer_1.PrivateMetricsServer(this, options);
        await endpoint.listen();
        if (this.destroyed) {
            await endpoint.close();
            throw new Error('Manager is shut down');
        }
        this.privateMetricsServers.add(endpoint);
        return endpoint;
    }
    detachLogger() {
        (0, ManagerLogRoute_1.getManagerLogRoute)(this)?.close();
    }
    startPerformanceMonitor(options) {
        if (this.destroyed)
            throw new Error('Manager is shut down');
        if (this.performanceMonitor?.running)
            return this.performanceMonitor;
        this.performanceMonitor = new PerformanceMonitor_1.PerformanceMonitor(this, options).start();
        return this.performanceMonitor;
    }
    useExtension(extension, options) {
        if (this.destroyed)
            return Promise.reject(new Error('Manager is shut down'));
        this.extensionHost ??= new ExtensionHost_1.ExtensionHost(this);
        return this.extensionHost.register(extension, options);
    }
    removeExtension(name) {
        return this.extensionHost?.remove(name) ?? Promise.resolve(false);
    }
    use(connector, client) {
        if (this.destroyed)
            throw new Error('Manager is shut down');
        connector.setManager(this);
        if (!this.send || this.send === this.missingSend)
            this.send = connector.send.bind(connector);
        this.connectors.add(connector);
        connector.listen(client);
        return this;
    }
    async init(clientId) {
        if (this.destroyed)
            throw new Error('Manager is shut down');
        if (this.initialized)
            return this;
        if (this.initializationPromise)
            return this.initializationPromise;
        (0, Util_1.validate)(clientId, (id) => typeof id === 'string' && /^\d{17,20}$/.test(id), 'init requires a valid clientId (a string of 17-20 digits).');
        this.clientId = clientId;
        const starting = Promise.resolve().then(async () => {
            this.database = new DatabaseManager_1.DatabaseManager(this);
            try {
                await this.database.initialize();
                if (this.destroyed)
                    return this;
                this.nodes.init();
                if (this.destroyed)
                    return this;
                if (this.options.playerDestruction?.autoDestroyOnIdle)
                    this.startIdleMonitoring();
                this.initialized = true;
                (0, ManagerLogRoute_1.getManagerLogRoute)(this)?.recordInitialized();
                this.emit('debug', `Moonlink.js > Manager >> Initialized. ClientId: ${this.clientId}`);
                return this;
            }
            catch (error) {
                this.initialized = false;
                if (this.idleCheckInterval)
                    clearInterval(this.idleCheckInterval);
                this.idleCheckInterval = undefined;
                const cleanup = await Promise.allSettled([...this.nodes.nodes.values()].map(node => Promise.resolve().then(() => node.destroy())));
                this.nodes.nodes.clear();
                cleanup.push(await this.database.shutdown().then(() => ({ status: 'fulfilled', value: undefined }), reason => ({ status: 'rejected', reason })));
                const errors = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
                if (errors.length)
                    throw new AggregateError([error, ...errors], `Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
        });
        this.initializationPromise = starting;
        void starting.catch(() => { if (this.initializationPromise === starting)
            this.initializationPromise = undefined; });
        return starting;
    }
    shutdown() {
        if (this.shutdownPromise)
            return this.shutdownPromise;
        this.shuttingDown = true;
        this.searches.close();
        this.telemetry?.close();
        this.initialized = false;
        if (this.idleCheckInterval)
            clearInterval(this.idleCheckInterval);
        this.idleCheckInterval = undefined;
        this.shutdownPromise = Promise.resolve().then(async () => {
            const errors = [];
            const attempt = async (operation) => {
                try {
                    await operation();
                }
                catch (error) {
                    errors.push(error);
                }
            };
            await Promise.all([...this.privateMetricsServers].map(endpoint => attempt(() => endpoint.close())));
            await attempt(() => this.extensionHost?.close());
            await attempt(() => this.performanceMonitor?.close());
            this.privateMetricsServers.clear();
            if (this.initializationPromise)
                await attempt(() => this.initializationPromise);
            await Promise.all(this.players.all.map(player => attempt(() => player.destroy('Manager shutdown'))));
            this.players.players.clear();
            await attempt(() => this.guildOwnership?.close());
            await Promise.all([...this.nodes.nodes.values()].map(node => attempt(() => node.destroy())));
            this.nodes.nodes.clear();
            for (const connector of this.connectors)
                await attempt(() => connector.dispose?.());
            this.connectors.clear();
            await attempt(() => this.detachLogger());
            if (this.databaseInstance)
                await attempt(() => this.databaseInstance?.shutdown());
            if (Util_1.Structure.getManager() === this)
                Util_1.Structure.setManager(undefined);
            if (errors.length)
                throw new AggregateError(errors, 'Manager shutdown encountered cleanup failures');
        });
        return this.shutdownPromise;
    }
    startIdleMonitoring() {
        const idleTimeout = this.options.playerDestruction?.idleTimeout ?? 300000;
        this.idleCheckInterval = setInterval(async () => {
            if (this.destroyed)
                return;
            const now = Date.now();
            for (const player of this.players.all) {
                if (this.destroyed)
                    return;
                if ((!player.playing || player.paused) && now - player.lastActivityTime >= idleTimeout) {
                    this.emit("debug", `Moonlink.js > Manager >> Player ${player.guildId} has been idle for ${idleTimeout}ms. Auto-destroying...`);
                    try {
                        await player.destroy('Idle timeout');
                    }
                    catch (error) {
                        this.emit('debug', `NyxLink > Manager > Idle cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
        }, 60000);
    }
    isSpotifyEnabled() {
        const config = this.options.spotify;
        if (!config)
            return false;
        if (config.enabled !== undefined)
            return config.enabled;
        return Boolean(config.clientId || config.clientSecret || config.accessToken);
    }
    isDeezerEnabled() {
        const config = this.options.deezer;
        if (!config)
            return false;
        if (config.enabled !== undefined)
            return config.enabled;
        return true;
    }
    getSpotifySource() {
        if (!this.isSpotifyEnabled())
            return null;
        if (!this.spotifySource) {
            this.spotifySource = new spotify_1.SpotifySource(this);
        }
        return this.spotifySource;
    }
    getDeezerSource() {
        if (!this.isDeezerEnabled())
            return null;
        if (!this.deezerSource) {
            this.deezerSource = new deezer_1.DeezerSource(this);
        }
        return this.deezerSource;
    }
    async resolveNativeSource(options) {
        let query = options.query;
        const source = options.source?.toLowerCase();
        if (source === "spotify") {
            query = `spsearch:${options.query}`;
        }
        else if (source === "spsearch" || source === "sprec") {
            query = `${source}:${options.query}`;
        }
        else if (source === "deezer") {
            query = `dzsearch:${options.query}`;
        }
        else if (source === "dzsearch") {
            query = `dzsearch:${options.query}`;
        }
        const spotify = this.getSpotifySource();
        if (spotify && spotify.match(query)) {
            return spotify.load(query, { signal: options.signal });
        }
        const deezer = this.getDeezerSource();
        if (deezer && deezer.match(query)) {
            return deezer.load(query, { signal: options.signal });
        }
        return null;
    }
    async search(options) {
        this.performanceMonitor?.recordSearch();
        const search = () => this.searches.search(options);
        const route = (0, ManagerLogRoute_1.getManagerLogRoute)(this);
        const run = () => route ? route.observe('search', search, {}, result => result.isError ? 'failed' : result.tracks.length ? 'completed' : 'empty') : search();
        return this.telemetry ? this.telemetry.search(run) : run();
    }
    async packetUpdate(packet) {
        await VoicePacketHandler_1.VoicePacketHandler.handle(this, packet);
    }
    decodeTrack(encoded) {
        (0, Util_1.validate)(encoded, (v) => typeof v === "string", "Manager#decodeTrack > Encoded string must be a string.");
        return (0, Util_1.decodeTrack)(encoded);
    }
    encodeTrack(track) {
        (0, Util_1.validate)(track, (v) => typeof v === "object", "Manager#encodeTrack > Track info must be an object.");
        return (0, Util_1.encodeTrack)(track);
    }
}
exports.Manager = Manager;
//# sourceMappingURL=Manager.js.map