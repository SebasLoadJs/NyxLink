"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Player = void 0;
const OpenTelemetry_1 = require("../observability/OpenTelemetry");
const NodeLinkContracts_1 = require("../backends/NodeLinkContracts");
const ProtocolContracts_1 = require("../backends/ProtocolContracts");
const PlayerMigration_1 = require("../players/PlayerMigration");
const PlayerCommandQueue_1 = require("../players/PlayerCommandQueue");
const PlaybackGuard_1 = require("../players/PlaybackGuard");
const PlaybackAttempt_1 = require("../players/PlaybackAttempt");
const NodeSelector_1 = require("../nodes/NodeSelector");
const Util_1 = require("../Util");
const Voice_1 = require("./Voice");
const Track_1 = require("./Track");
const TrackCodec_1 = require("../tracks/TrackCodec");
const TrackResolver_1 = require("../tracks/TrackResolver");
const VoiceReceiver_1 = require("./VoiceReceiver");
const PlayerSnapshot_1 = require("../database/PlayerSnapshot");
const NodeLinkMixContracts_1 = require("../backends/NodeLinkMixContracts");
const PlayerOperationCancelledError_1 = require("../errors/PlayerOperationCancelledError");
const QueuePreload_1 = require("../players/QueuePreload");
class Player {
    manager;
    node;
    nodeSelection;
    guildId;
    queue;
    filters;
    voice;
    data = {};
    voiceChannelId;
    textChannelId;
    playing = false;
    paused = false;
    connected = false;
    destroyed = false;
    volume = 100;
    loop = "off";
    loopCount;
    autoPlay = false;
    autoLeave = false;
    ping = -1;
    isResuming = false;
    current = null;
    previous = [];
    recommendations = [];
    historySize = 10;
    lastActivityTime = Date.now();
    commands = new PlayerCommandQueue_1.PlayerCommandQueue();
    get pendingCommands() { return this.commands.pending; }
    destructionPromise;
    pendingPlayTicket;
    lastSuccessfulExplicitPlayTicket;
    volumeRevision = 0;
    optimisticVolumeRevision = 0;
    fading;
    crossfade;
    nextTrack;
    preloadOptions;
    queuePreload;
    preloadScheduler = new QueuePreload_1.QueuePreloadScheduler();
    get preloadJob() { return this.preloadScheduler.pending; }
    audioTrackId;
    loudnessNormalizer;
    endTime;
    healthCheckTimer;
    lastPosition = 0;
    lastPositionTime = Date.now();
    stuckDetectionCount = 0;
    silentDetectionCount = 0;
    resumeDebounceTimer;
    isResumeInProgress = false;
    lastResumeAttempt = 0;
    constructor(manager, node, config) {
        NodeSelector_1.NodeSelector.validate(config.nodeSelection);
        const requirements = config.nodeSelection ?? {};
        this.nodeSelection = Object.freeze({
            ...(requirements.backend !== undefined ? { backend: requirements.backend } : {}),
            ...(requirements.requiredCapabilities !== undefined ? { requiredCapabilities: Object.freeze([...requirements.requiredCapabilities]) } : {}),
            ...(requirements.region !== undefined ? { region: requirements.region } : {}),
            ...(requirements.regionPolicy !== undefined ? { regionPolicy: requirements.regionPolicy } : {}),
        });
        this.manager = manager;
        this.node = node;
        this.guildId = config.guildId;
        this.voiceChannelId = config.voiceChannelId;
        this.textChannelId = config.textChannelId || config.voiceChannelId;
        this.volume = config.volume ?? this.manager.options.defaultPlayer?.volume ?? 100;
        this.set("selfDeaf", config.selfDeaf ?? this.manager.options.defaultPlayer?.selfDeaf ?? true);
        this.set("selfMute", config.selfMute ?? this.manager.options.defaultPlayer?.selfMute ?? false);
        this.autoPlay = config.autoPlay ?? this.manager.options.defaultPlayer?.autoPlay ?? false;
        this.autoLeave = config.autoLeave ?? this.manager.options.defaultPlayer?.autoLeave ?? false;
        this.loop = config.loop ?? this.manager.options.defaultPlayer?.loop ?? "off";
        this.loopCount = config.loopCount;
        this.historySize = this.manager.options.defaultPlayer?.historySize ?? 10;
        this.queue = new (Util_1.Structure.get("Queue"))(this);
        this.filters = new (Util_1.Structure.get("Filters"))(this);
        this.voice = new Voice_1.Voice(this);
        if (config.current) {
            this.current = TrackCodec_1.TrackCodec.restore(config.current);
            this.lastPosition = this.current.getInfo().position;
        }
        if (config.queue && Array.isArray(config.queue)) {
            for (const track of config.queue) {
                this.queue.add(TrackCodec_1.TrackCodec.restore(track));
            }
        }
        if (config.previous && Array.isArray(config.previous)) {
            for (const track of config.previous) {
                this.previous.push(TrackCodec_1.TrackCodec.restore(track));
            }
        }
        this.manager.emit("debug", `Moonlink.js > Player#constructor >> Player created for guild ${this.guildId} on node ${this.node.identifier} | autoPlay: ${this.autoPlay}, autoLeave: ${this.autoLeave}, loop: ${this.loop}`);
        this.startHealthCheck();
    }
    startHealthCheck() {
        this.stopHealthCheck();
        const interval = this.manager.options.playerHealth?.checkInterval ?? 30000;
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck();
        }, interval);
    }
    stopHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }
    }
    async performHealthCheck() {
        if (this.destroyed || !this.connected)
            return;
        const now = Date.now();
        const silenceTimeout = this.manager.options.playerHealth?.silenceTimeout ?? 120000;
        const maxStuckCount = this.manager.options.playerHealth?.maxStuckCount ?? 3;
        const maxSilentCount = this.manager.options.playerHealth?.maxSilentCount ?? 2;
        if (this.playing && !this.paused && this.current) {
            const currentPosition = this.current.position ?? 0;
            const positionDelta = Math.abs(currentPosition - this.lastPosition);
            const timeDelta = now - this.lastPositionTime;
            if (positionDelta < 1000 && timeDelta > 30000 && !this.current.getInfo().isStream) {
                this.stuckDetectionCount++;
                this.manager.emit("debug", `Moonlink.js > Player#healthCheck >> Player ${this.guildId} appears stuck. Position: ${currentPosition}, Delta: ${positionDelta}, Stuck count: ${this.stuckDetectionCount}/${maxStuckCount}`);
                if (this.stuckDetectionCount >= maxStuckCount) {
                    this.manager.emit("debug", `Moonlink.js > Player#healthCheck >> Player ${this.guildId} stuck for too long, attempting recovery.`);
                    await this.recoverFromStuck();
                    this.stuckDetectionCount = 0;
                    return;
                }
            }
            else {
                if (this.stuckDetectionCount > 0) {
                    this.manager.emit("debug", `Moonlink.js > Player#healthCheck >> Player ${this.guildId} position advanced (Delta: ${positionDelta}). Resetting stuck count.`);
                }
                this.stuckDetectionCount = 0;
            }
            const activityDelta = now - this.lastActivityTime;
            if (activityDelta > silenceTimeout) {
                this.silentDetectionCount++;
                this.manager.emit("debug", `Moonlink.js > Player#healthCheck >> Player ${this.guildId} silent for ${Math.round(activityDelta / 1000)}s. Silent count: ${this.silentDetectionCount}/${maxSilentCount}`);
                if (this.silentDetectionCount >= maxSilentCount) {
                    this.manager.emit("debug", `Moonlink.js > Player#healthCheck >> Player ${this.guildId} silent for too long, attempting soft restart.`);
                    await this.softRestart("Silent player detected");
                    this.silentDetectionCount = 0;
                    return;
                }
            }
            else {
                this.silentDetectionCount = 0;
            }
            this.lastPosition = currentPosition;
            this.lastPositionTime = now;
        }
        else {
            this.stuckDetectionCount = 0;
            this.silentDetectionCount = 0;
        }
    }
    async recoverFromStuck() {
        if (this.destroyed)
            return;
        let ticket = (0, PlaybackGuard_1.playbackGuard)(this).ticket;
        this.manager.emit("playerRecoveryStarted", this);
        try {
            if (this.current && this.current.getInfo().isSeekable) {
                const seekPos = Math.max(0, (this.current.position ?? 0) + 2000);
                this.manager.emit("debug", `Moonlink.js > Player#recoverFromStuck >> Seeking forward 2s for player ${this.guildId}.`);
                await this.seek(seekPos);
            }
            else {
                const restoring = this.softRestart("Stuck player recovery");
                ticket = (0, PlaybackGuard_1.playbackGuard)(this).ticket;
                if (!await restoring) {
                    throw new Error("Soft restart did not restore playback");
                }
            }
            if (this.destroyed || !(0, PlaybackGuard_1.playbackGuard)(this).isCurrent(ticket))
                return;
            this.manager.emit("playerRecoverySuccess", this);
        }
        catch (error) {
            this.manager.emit("debug", `Moonlink.js > Player#recoverFromStuck >> Recovery failed: ${error.message}`);
            this.manager.emit("playerRecoveryFailed", this);
        }
    }
    async softRestart(reason) {
        if (this.destroyed)
            return false;
        this.manager.emit("debug", `Moonlink.js > Player#softRestart >> Soft restart triggered for player ${this.guildId}. Reason: ${reason}`);
        const currentTrack = this.current;
        const currentPosition = currentTrack?.position ?? 0;
        const wasPaused = this.paused;
        if (!currentTrack) {
            this.manager.emit("debug", `Moonlink.js > Player#softRestart >> No current track, skipping soft restart for player ${this.guildId}.`);
            return false;
        }
        try {
            const stopping = this.stop();
            const ticket = (0, PlaybackGuard_1.playbackGuard)(this).ticket;
            await stopping;
            if (this.destroyed || !(0, PlaybackGuard_1.playbackGuard)(this).isCurrent(ticket))
                return false;
            await new Promise(resolve => setTimeout(resolve, 500));
            if (this.destroyed || !(0, PlaybackGuard_1.playbackGuard)(this).isCurrent(ticket))
                return false;
            if (this.voice.sessionId && this.voice.token && this.voice.endpoint) {
                const voicePayload = {
                    sessionId: this.voice.sessionId,
                    token: this.voice.token,
                    endpoint: this.voice.endpoint
                };
                if (this.node.isNodeLink) {
                    voicePayload.channelId = this.voiceChannelId;
                }
                await this.updatePlayer({ voice: voicePayload }, true);
            }
            if (this.destroyed || !(0, PlaybackGuard_1.playbackGuard)(this).isCurrent(ticket))
                return false;
            const restored = await this.commands.enqueue(() => this.playNext({
                track: currentTrack,
                position: currentPosition,
                noReplace: false
            }, ticket));
            if (!restored)
                return false;
            if (this.destroyed || !(0, PlaybackGuard_1.playbackGuard)(this).isCurrent(ticket))
                return false;
            if (wasPaused) {
                await this.pause();
            }
            if (this.destroyed || !(0, PlaybackGuard_1.playbackGuard)(this).isCurrent(ticket))
                return false;
            this.stuckDetectionCount = 0;
            this.silentDetectionCount = 0;
            this.lastPosition = currentPosition;
            this.lastPositionTime = Date.now();
            this.updateActivity();
            this.manager.emit("debug", `Moonlink.js > Player#softRestart >> Soft restart completed for player ${this.guildId}.`);
            return true;
        }
        catch (error) {
            this.manager.emit("debug", `Moonlink.js > Player#softRestart >> Soft restart failed: ${error.message}`);
            return false;
        }
    }
    updateActivity() {
        this.lastActivityTime = Date.now();
    }
    set(key, value) {
        this.data[key] = value;
        return this;
    }
    get(key) {
        return this.data[key];
    }
    updateData(path, data) {
        const dbPath = `players.${this.guildId}${path ? `.${path}` : ''}`;
        const operation = this.manager.database.set(dbPath, data);
        void operation.catch(error => this.manager.emit('debug', `NyxLink > Storage > Write failed for ${dbPath}: ${error.message}`));
        return operation;
    }
    exportSnapshot() {
        return this.commands.enqueue(async () => {
            if (this.destroyed)
                throw new Error('Cannot export a destroyed player');
            const record = await this.manager.database.get(`players.${this.guildId}`);
            if (this.destroyed)
                throw new Error('Cannot export a destroyed player');
            return PlayerSnapshot_1.PlayerSnapshotCodec.capture(this, (0, PlayerSnapshot_1.recordRevision)(record));
        });
    }
    assertNodeLinkFeature(feature) {
        this.node.assertFeature(feature);
    }
    resolveEncodedTrack(track) {
        if (track instanceof Track_1.Track)
            return track.encoded;
        if (typeof track === "string" && track.length > 0)
            return track;
        throw new Error("Invalid track input. Provide a Track instance or encoded string.");
    }
    async sendPlayerUpdate(payload, noReplace, reservedTrack) {
        await this.manager.guildOwnership?.assertCurrent(this.guildId);
        const finalPayload = this.node.backend
            ? this.node.backend.preparePlayerUpdate(payload, this.voiceChannelId)
            : (0, ProtocolContracts_1.preparePlayerUpdate)(this.node.isNodeLink ? 'nodelink' : 'unknown', payload, this.voiceChannelId);
        const attempts = (0, PlaybackAttempt_1.playbackAttempt)(this);
        const attempt = typeof payload.track?.encoded === 'string' ? attempts.begin(this.node, { ...payload.track, encoded: payload.track.encoded }, typeof payload.paused === 'boolean') : undefined;
        if (attempt)
            finalPayload.track = attempt.track;
        const preload = typeof payload.nextTrack?.encoded === 'string' || payload.nextTrack === null ? attempts.preload(this.node, payload.nextTrack) : undefined;
        if (preload)
            finalPayload.nextTrack = preload.track;
        const previousReservation = this.queuePreload;
        const reservation = reservedTrack ? { track: reservedTrack, node: this.node, session: this.node.sessionId } : undefined;
        if (preload)
            this.queuePreload = reservation;
        let acknowledged = false;
        try {
            const response = await this.node.rest.updatePlayer(this.guildId, finalPayload, noReplace);
            if (response == null)
                throw new Error("Backend did not acknowledge player update");
            acknowledged = true;
            if (attempt && !attempt.accepted(response))
                throw new Error("Backend did not accept the requested track");
            if (preload && !this.destroyed) {
                if (payload.nextTrack === null)
                    this.nextTrack = undefined;
                else if (preload.pending() && payload.nextTrack)
                    this.nextTrack = structuredClone(payload.nextTrack);
            }
            return response;
        }
        catch (error) {
            attempt?.rollback();
            if (!acknowledged) {
                const restoreReservation = preload && this.queuePreload === reservation && (!reservation || preload.pending());
                preload?.rollback();
                if (restoreReservation)
                    this.queuePreload = previousReservation;
            }
            throw error;
        }
    }
    async updatePlayer(payload, noReplace) {
        return this.commands.enqueue(() => {
            if (this.destroyed)
                throw new Error("Cannot update a destroyed player");
            return this.sendPlayerUpdate(payload, noReplace);
        });
    }
    async updateVoice(voice) {
        if (this.destroyed)
            throw new Error("Cannot update voice on a destroyed player");
        return this.sendPlayerUpdate({ voice }, true);
    }
    async connect({ selfDeaf, selfMute } = {}) {
        await this.manager.guildOwnership?.assertCurrent(this.guildId);
        this.node.cancelVoiceReconnect?.(this);
        const connectStack = new Error().stack?.split("\n").slice(2, 8).join("\n");
        this.manager.emit("debug", `Moonlink.js > Player#connect -> Connect requested for guild ${this.guildId}. Stack: ${connectStack || "unavailable"}`);
        this.set("userInitiatedConnect", true);
        if (selfDeaf !== undefined)
            this.set("selfDeaf", selfDeaf);
        if (selfMute !== undefined)
            this.set("selfMute", selfMute);
        await this.voice.connect({ selfDeaf: this.get("selfDeaf") ?? true, selfMute: this.get("selfMute") ?? false });
        return this;
    }
    async disconnect() {
        this.node.cancelVoiceReconnect?.(this);
        const disconnectStack = new Error().stack?.split("\n").slice(2, 8).join("\n");
        this.manager.emit("debug", `Moonlink.js > Player#disconnect -> Disconnect requested for guild ${this.guildId}. Stack: ${disconnectStack || "unavailable"}`);
        this.set("userInitiatedConnect", false);
        await this.voice.disconnect();
        return this;
    }
    async play(options = {}) {
        const ticket = (0, PlaybackGuard_1.playbackGuard)(this).invalidate();
        this.pendingPlayTicket = ticket;
        return this.commands.enqueue(async () => {
            const played = await (0, OpenTelemetry_1.observeOperation)(this.manager, 'nyxlink.player.play', () => this.playNext(options, ticket), result => result ? 'success' : 'resolved');
            if (played)
                this.lastSuccessfulExplicitPlayTicket = ticket;
            return played;
        }).finally(() => {
            if (this.pendingPlayTicket === ticket)
                this.pendingPlayTicket = undefined;
        });
    }
    async playAutoPlay(track, ticket, automaticTicket) {
        return this.commands.enqueue(async () => {
            if (this.queue.size > 0)
                return false;
            let automaticTrackQueued = false;
            const markAutomaticQueue = (queued) => { automaticTrackQueued = queued; };
            try {
                return await (0, OpenTelemetry_1.observeOperation)(this.manager, 'nyxlink.autoplay', () => this.playNext({ track }, ticket, () => this.autoPlay && (0, PlaybackGuard_1.playbackGuard)(this).isAutoCurrent(automaticTicket) &&
                    (automaticTrackQueued
                        ? this.queue.size === 1 && this.queue.first === track
                        : this.queue.size === 0), markAutomaticQueue), result => result ? 'success' : 'resolved');
            }
            finally {
                if (automaticTrackQueued) {
                    const index = this.queue.tracks.indexOf(track);
                    if (index >= 0)
                        this.queue.remove(index);
                }
            }
        });
    }
    async playNext(options, ticket, allowed = () => true, onInjectedQueueChange, suppressHistory = false) {
        try {
            return await this.applyPlayback(options, ticket, allowed, onInjectedQueueChange, suppressHistory);
        }
        finally {
            (0, PlaybackAttempt_1.playbackAttempt)(this).retain(ticket);
        }
    }
    async applyPlayback(options, ticket, allowed, onInjectedQueueChange, suppressHistory = false) {
        const guard = (0, PlaybackGuard_1.playbackGuard)(this);
        if (this.destroyed || !guard.isCurrent(ticket) || !allowed())
            return false;
        this.recommendations = [];
        let finalOptions;
        if (options instanceof Track_1.Track) {
            finalOptions = { track: options };
        }
        else if ('encoded' in options && 'info' in options) {
            finalOptions = { track: options };
        }
        else {
            finalOptions = options;
        }
        this.manager.emit("debug", `NyxLink > Player#play -> Playback requested for guild ${this.guildId}. Explicit track: ${Boolean(finalOptions.track || finalOptions.encoded)}`);
        if (!this.voice.sessionId || !this.voice.endpoint) {
            this.manager.emit("debug", `Moonlink.js > Player#play >> Voice not ready for guild ${this.guildId}, attempting to connect...`);
            try {
                await this.connect();
            }
            catch (e) {
                this.manager.emit("debug", `Moonlink.js > Player#play >> Failed to connect voice: ${e}`);
                return false;
            }
        }
        if (!guard.isCurrent(ticket) || this.destroyed || !allowed())
            return false;
        let track = finalOptions.track;
        if (finalOptions.encoded) {
            try {
                const decoded = (0, Util_1.decodeTrack)(finalOptions.encoded);
                track = new Track_1.Track(decoded, finalOptions.requester, undefined, this.manager.options.trackPartial ?? []);
            }
            catch (e) {
                this.manager.emit("debug", `Moonlink.js > Player#play >> Error decoding track for guild ${this.guildId}. Error: ${e}`);
                return false;
            }
        }
        if (track && !(track instanceof Track_1.Track)) {
            try {
                track = new Track_1.Track(track, finalOptions.requester, undefined, this.manager.options.trackPartial ?? []);
            }
            catch (e) {
                this.manager.emit("debug", `Moonlink.js > Player#play >> Invalid track object for guild ${this.guildId}. Error: ${e}`);
                return false;
            }
        }
        if (track) {
            this.queue.unshift(track);
            onInjectedQueueChange?.(true);
            this.manager.emit("debug", `Moonlink.js > Player#play >> Added track "${track.title}" to front of queue for guild ${this.guildId}`);
        }
        if (this.queue.size === 0) {
            this.manager.emit("debug", `Moonlink.js > Player#play >> Queue is empty, cannot start playback for guild ${this.guildId}`);
            return false;
        }
        const previousTrack = this.current;
        const queuedTrack = this.queue.first;
        let nextTrack = queuedTrack;
        if (!queuedTrack || !nextTrack || !nextTrack.encoded) {
            this.manager.emit("debug", `NyxLink > Player#play >> Invalid track data for guild ${this.guildId}.`);
            return false;
        }
        let selectedPlaybackTrack;
        try {
            nextTrack = await TrackResolver_1.TrackResolver.resolve(nextTrack, this.node, undefined, guard.signal);
            selectedPlaybackTrack = nextTrack instanceof Track_1.Track ? nextTrack :
                new Track_1.Track(nextTrack, undefined, undefined, this.manager.options.trackPartial ?? []);
        }
        catch (error) {
            this.manager.emit('debug', `NyxLink > TrackResolver > ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
        if (this.destroyed || !guard.isCurrent(ticket) || !allowed() || this.queue.first !== queuedTrack)
            return false;
        this.queue.shift();
        onInjectedQueueChange?.(false);
        const oldTrackTitle = this.current?.title ?? "null";
        const positionBeforePlayback = selectedPlaybackTrack.position;
        this.current = selectedPlaybackTrack;
        this.current.position = finalOptions.position || 0;
        this.updateData("current", TrackCodec_1.TrackCodec.serialize(this.current));
        this.manager.emit("debug", `Moonlink.js > Player#play >> Player state changed: current track: ${oldTrackTitle} -> ${this.current.title}`);
        const oldPlaying = this.playing;
        const oldPaused = this.paused;
        this.playing = true;
        this.paused = false;
        this.updateData("playing", this.playing);
        this.updateData("paused", this.paused);
        const audioTrackId = finalOptions.audioTrackId ?? this.audioTrackId;
        const payload = {
            track: {
                encoded: this.current.encoded,
                userData: this.current.userData
            },
            position: finalOptions.position || this.current.position,
            volume: this.volume
        };
        if (audioTrackId) {
            payload.track.audioTrackId = audioTrackId;
        }
        if (this.fading)
            payload.fading = this.fading;
        if (this.crossfade && this.node.isNodeLink)
            payload.crossfade = this.crossfade;
        if (this.queuePreload) {
            if (this.node.isNodeLink)
                payload.nextTrack = null;
        }
        else if (this.nextTrack)
            payload.nextTrack = this.nextTrack;
        if (this.loudnessNormalizer !== undefined) {
            payload.loudnessNormalizer = this.loudnessNormalizer;
        }
        this.manager.emit("playerTriggeredPlay", this, this.current);
        this.manager.emit("debug", `NyxLink > Player#play -> Sending play request to node ${this.node.identifier} for guild ${this.guildId}.`);
        try {
            const response = await this.sendPlayerUpdate(payload, finalOptions.noReplace ?? this.manager.options.noReplace);
            if (response == null)
                throw new Error("Backend did not acknowledge playback");
            if (!guard.isCurrent(ticket) || this.destroyed)
                return false;
            this.manager.emit("debug", `Moonlink.js > Player#play >> Successfully sent play request for track "${this.current.title}" for guild ${this.guildId}`);
        }
        catch (e) {
            this.manager.emit("debug", `Moonlink.js > Player#play >> CRITICAL: Failed to send play request for guild ${this.guildId}. Reverting state. Error: ${e.message}`);
            this.playing = oldPlaying;
            this.paused = oldPaused;
            selectedPlaybackTrack.position = positionBeforePlayback;
            this.current = previousTrack;
            this.updateData("current", previousTrack ? TrackCodec_1.TrackCodec.serialize(previousTrack) : null);
            this.updateData("playing", oldPlaying);
            this.updateData("paused", oldPaused);
            this.queue.unshift(queuedTrack);
            onInjectedQueueChange?.(true);
            return false;
        }
        if (previousTrack && !suppressHistory && !this.get("isBackPlay")) {
            this.previous.push(previousTrack);
            const historyLimit = this.manager.options.queue?.historyLimit ?? this.historySize;
            if (this.previous.length > historyLimit) {
                this.previous.shift();
            }
            this.updateData("previous", this.previous.map(t => TrackCodec_1.TrackCodec.serialize(t)));
            this.manager.emit("debug", `Moonlink.js > Player#play << Added track "${previousTrack.title}" to history for guild ${this.guildId}. History size: ${this.previous.length}`);
        }
        this.set("isBackPlay", false);
        this.playing = true;
        this.paused = false;
        this.manager.emit("debug", `Moonlink.js > Player#play >> Player state changed: playing: ${oldPlaying} -> ${this.playing}, paused: ${oldPaused} -> ${this.paused}`);
        this.node.updateRecommendations(this).catch(() => { });
        return true;
    }
    async addMix(track, options) {
        this.assertNodeLinkFeature("mix:add");
        const encoded = this.resolveEncodedTrack(track);
        const body = (0, NodeLinkMixContracts_1.mixCreateBody)({
            track: { encoded, userData: options?.userData },
            volume: options?.volume
        });
        return this.mixCommand('mix:add', node => node.rest.addMixLayer(this.guildId, body));
    }
    async getMixes() {
        this.assertNodeLinkFeature("mix:list");
        return this.mixCommand('mix:list', node => node.rest.getMixLayers(this.guildId));
    }
    async updateMixVolume(mixId, volume) {
        this.assertNodeLinkFeature("mix:update");
        await this.mixCommand('mix:update', node => node.rest.updateMixLayerVolume(this.guildId, mixId, volume));
        return this;
    }
    async removeMix(mixId) {
        this.assertNodeLinkFeature("mix:remove");
        await this.mixCommand('mix:remove', node => node.rest.removeMixLayer(this.guildId, mixId));
        return this;
    }
    mixCommand(operation, execute) {
        const node = this.node, session = node.sessionId, socket = node.socket, backend = node.backend;
        const guard = (0, PlaybackGuard_1.playbackGuard)(this), ticket = guard.ticket;
        const active = () => !this.destroyed && !this.manager.destroyed && !node.destroyed && node.connected &&
            this.node === node && node.sessionId === session && node.socket === socket && node.backend === backend && guard.isCurrent(ticket);
        return this.commands.enqueue(async () => {
            if (!active())
                throw new PlayerOperationCancelledError_1.PlayerOperationCancelledError(operation);
            let result;
            try {
                result = await execute(node);
            }
            catch (error) {
                if (!active())
                    throw new PlayerOperationCancelledError_1.PlayerOperationCancelledError(operation);
                throw error;
            }
            if (!active())
                throw new PlayerOperationCancelledError_1.PlayerOperationCancelledError(operation);
            return result;
        });
    }
    async subscribeLyrics(options) {
        this.assertNodeLinkFeature("lyrics:subscribe");
        await this.node.rest.subscribeLyrics(this.guildId, options?.skipTrackSource);
        return this;
    }
    async unsubscribeLyrics() {
        this.assertNodeLinkFeature("lyrics:unsubscribe");
        await this.node.rest.unsubscribeLyrics(this.guildId);
        return this;
    }
    async loadChapters(encodedTrack) {
        this.assertNodeLinkFeature("chapters");
        const target = encodedTrack ?? this.current?.encoded;
        if (!target) {
            throw new Error("loadChapters requires an encoded track or an active player track.");
        }
        return this.node.rest.loadChapters(target);
    }
    async loadMeaning(encodedTrack, lang) {
        this.assertNodeLinkFeature("meaning");
        const target = encodedTrack ?? this.current?.encoded;
        if (!target) {
            throw new Error("loadMeaning requires an encoded track or an active player track.");
        }
        return this.node.rest.loadMeaning(target, lang);
    }
    async getLoadDirectStream(options) {
        this.assertNodeLinkFeature("loadstream");
        const target = this.current?.encoded;
        if (!target) {
            throw new Error("getLoadDirectStream requires an active player track.");
        }
        return this.node.loadDirectStream(target, options?.volume, options?.position, options?.filters);
    }
    async getDirectStream(itag) {
        this.assertNodeLinkFeature("trackstream");
        const target = this.current?.encoded;
        if (!target) {
            throw new Error("getDirectStream requires an active player track.");
        }
        return this.node.getDirectStream(target, itag);
    }
    async setFading(fading) {
        const config = structuredClone(fading);
        return this.commands.enqueue(async () => {
            if (this.destroyed)
                throw new Error("Cannot update a destroyed player");
            this.assertNodeLinkFeature("fading");
            await this.sendPlayerUpdate({ fading: config });
            if (!this.destroyed)
                this.fading = config;
            return this;
        });
    }
    async clearFading() {
        return this.setFading({ enabled: false });
    }
    getCrossfade() {
        return this.crossfade ? { ...this.crossfade } : undefined;
    }
    async setCrossfade(options) {
        const config = (0, NodeLinkContracts_1.normalizeCrossfade)(options);
        return this.commands.enqueue(async () => {
            if (this.destroyed)
                throw new Error("Cannot update a destroyed player");
            this.assertNodeLinkFeature("crossfade");
            await (0, OpenTelemetry_1.observeOperation)(this.manager, 'nyxlink.crossfade', () => this.sendPlayerUpdate({ crossfade: config }));
            if (!this.destroyed) {
                this.crossfade = config;
                this.requestQueuePreload();
            }
            return this;
        });
    }
    async clearCrossfade() {
        return this.setCrossfade({ enabled: false });
    }
    async setNextTrack(track, userData) {
        const encoded = this.resolveEncodedTrack(track);
        return this.commands.enqueue(async () => {
            if (this.destroyed)
                throw new Error("Cannot update a destroyed player");
            this.assertNodeLinkFeature("nextTrack");
            const nextTrack = { encoded, userData: userData ?? (track instanceof Track_1.Track ? track.userData : undefined) };
            await this.sendPlayerUpdate({ nextTrack });
            return this;
        });
    }
    async clearNextTrack() {
        return this.commands.enqueue(async () => {
            if (this.destroyed)
                throw new Error("Cannot update a destroyed player");
            this.assertNodeLinkFeature("nextTrack");
            await this.sendPlayerUpdate({ nextTrack: null });
            return this;
        });
    }
    getNextTrack() {
        return this.nextTrack ? structuredClone(this.nextTrack) : undefined;
    }
    setQueuePreload(options) {
        if (!options || typeof options.enabled !== 'boolean' ||
            options.leadMs !== undefined && (!Number.isSafeInteger(options.leadMs) || options.leadMs < 1000 || options.leadMs > 120000)) {
            throw new TypeError('Invalid queue preload options');
        }
        this.preloadOptions = { enabled: options.enabled, leadMs: options.leadMs ?? 35000 };
        this.requestQueuePreload();
        return this;
    }
    requestQueuePreload() {
        if (this.destroyed || this.manager.destroyed || (!this.preloadOptions?.enabled && !this.queuePreload))
            return;
        const ticket = (0, PlaybackGuard_1.playbackGuard)(this).ticket;
        const node = this.node;
        const session = node.sessionId;
        const active = () => !this.destroyed && !this.manager.destroyed && this.node === node &&
            node.connected && !node.destroyed && node.sessionId === session && (0, PlaybackGuard_1.playbackGuard)(this).isCurrent(ticket);
        const desired = () => active() ? (0, QueuePreload_1.desiredPreload)(this, this.preloadOptions, !!this.crossfade?.enabled) : undefined;
        this.preloadScheduler.request(operation => this.commands.enqueue(operation), async () => {
            if (!active())
                return;
            const reservation = this.queuePreload;
            if (reservation && (reservation.node !== node || reservation.session !== session)) {
                this.queuePreload = undefined;
                this.nextTrack = undefined;
            }
            if (!node.isNodeLink)
                return;
            let candidate = desired();
            if (this.queuePreload) {
                if (this.queuePreload.track === candidate)
                    return;
                await this.sendPlayerUpdate({ nextTrack: null });
                candidate = desired();
            }
            if (!candidate || this.paused || this.nextTrack)
                return;
            const current = this.current;
            const resolved = await TrackResolver_1.TrackResolver.resolve(candidate, node, undefined, (0, PlaybackGuard_1.playbackGuard)(this).signal);
            if (this.current !== current || desired() !== candidate || this.paused || this.nextTrack)
                return;
            await this.sendPlayerUpdate({ nextTrack: { encoded: resolved.encoded, userData: resolved.userData } }, undefined, candidate);
        }, () => {
            this.manager.emit('debug', 'NyxLink > Queue preload request failed');
        }, () => this.requestQueuePreload());
    }
    consumePreloadedTrack() {
        const reservation = this.queuePreload;
        this.queuePreload = undefined;
        this.nextTrack = undefined;
        if (reservation && reservation.node === this.node && reservation.session === this.node.sessionId) {
            const index = this.queue.tracks.indexOf(reservation.track);
            if (index !== -1)
                this.queue.remove(index);
            if (this.current) {
                this.previous.push(this.current);
                const limit = this.manager.options.queue?.historyLimit ?? this.historySize;
                if (this.previous.length > limit)
                    this.previous.shift();
                this.updateData('previous', this.previous.map(track => TrackCodec_1.TrackCodec.serialize(track)));
            }
        }
    }
    setAudioTrackId(audioTrackId) {
        this.assertNodeLinkFeature("audioTrackId");
        this.audioTrackId = audioTrackId;
        return this;
    }
    async setLoudnessNormalizer(enabled) {
        if (typeof enabled !== 'boolean')
            throw new TypeError('Invalid loudness normalizer state');
        return this.commands.enqueue(async () => {
            if (this.destroyed)
                throw new Error("Cannot update a destroyed player");
            this.assertNodeLinkFeature("loudnessNormalizer");
            await this.sendPlayerUpdate({ loudnessNormalizer: enabled });
            if (!this.destroyed)
                this.loudnessNormalizer = enabled;
            return this;
        });
    }
    createVoiceReceiver(options) {
        this.assertNodeLinkFeature("voiceReceive");
        return new VoiceReceiver_1.VoiceReceiver(this.node, this.guildId, options);
    }
    async pause() {
        return this.commands.enqueue(() => this.pausePlayback());
    }
    async pausePlayback() {
        if (this.destroyed)
            return this;
        if (this.paused) {
            this.manager.emit("debug", `Moonlink.js > Player#pause >> Player is already paused for guild ${this.guildId}`);
            return this;
        }
        this.manager.emit("debug", `Moonlink.js > Player#pause -> Sending pause request to node ${this.node.identifier} for guild ${this.guildId}`);
        this.manager.emit("playerTriggeredPause", this);
        await this.sendPlayerUpdate({ paused: true });
        const oldPaused = this.paused;
        this.paused = true;
        this.updateData("paused", this.paused);
        this.manager.emit("debug", `Moonlink.js > Player#pause >> Player state changed: paused: ${oldPaused} -> ${this.paused}`);
        this.manager.emit("debug", `Moonlink.js > Player#pause >> Player paused for guild ${this.guildId}`);
        return this;
    }
    async resume(options) {
        const pending = this.commands.enqueue(() => this.resumePlayback());
        if (!options?.timeout)
            return pending;
        let timer;
        try {
            return await Promise.race([
                pending,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("Resume timed out")), options.timeout);
                })
            ]);
        }
        finally {
            clearTimeout(timer);
        }
    }
    async resumePlayback() {
        if (this.destroyed)
            return this;
        const now = Date.now();
        const minResumeInterval = this.manager.options.playerHealth?.resumeDebounce ?? 1000;
        if (this.isResumeInProgress) {
            this.manager.emit("debug", `Moonlink.js > Player#resume >> Resume already in progress for guild ${this.guildId}, skipping.`);
            return this;
        }
        if (now - this.lastResumeAttempt < minResumeInterval) {
            this.manager.emit("debug", `Moonlink.js > Player#resume >> Resume debounced for guild ${this.guildId} (last attempt ${now - this.lastResumeAttempt}ms ago).`);
            return this;
        }
        this.updateActivity();
        if (!this.paused) {
            this.manager.emit("debug", `Moonlink.js > Player#resume >> Player is not paused for guild ${this.guildId}`);
            return this;
        }
        this.isResumeInProgress = true;
        this.lastResumeAttempt = now;
        this.manager.emit("debug", `Moonlink.js > Player#resume -> Sending resume request to node ${this.node.identifier} for guild ${this.guildId}`);
        this.manager.emit("playerTriggeredResume", this);
        try {
            await this.sendPlayerUpdate({ paused: false });
            const oldPaused = this.paused;
            this.paused = false;
            this.updateData("paused", this.paused);
            this.manager.emit("debug", `Moonlink.js > Player#resume >> Player state changed: paused: ${oldPaused} -> ${this.paused}`);
            this.manager.emit("debug", `Moonlink.js > Player#resume >> Player resumed for guild ${this.guildId}`);
        }
        finally {
            this.isResumeInProgress = false;
        }
        return this;
    }
    async forward(ms) {
        if (!this.current)
            return this;
        const newPosition = Math.min(this.current.getInfo().length, this.current.getInfo().position + ms);
        return this.seek(newPosition);
    }
    async rewind(ms) {
        if (!this.current)
            return this;
        const newPosition = Math.max(0, this.current.getInfo().position - ms);
        return this.seek(newPosition);
    }
    async setVoiceState(state) {
        if (state.channelId) {
            this.setVoiceChannelId(state.channelId);
        }
        const selfMute = state.selfMute ?? this.get("selfMute");
        const selfDeaf = state.selfDeaf ?? this.get("selfDeaf");
        this.set("selfMute", selfMute);
        this.set("selfDeaf", selfDeaf);
        await this.connect({ selfMute, selfDeaf });
        return this;
    }
    async toggleMute() {
        return this.setVoiceState({ selfMute: !this.get("selfMute") });
    }
    async toggleDeaf() {
        return this.setVoiceState({ selfDeaf: !this.get("selfDeaf") });
    }
    async search(query, source) {
        return this.manager.search({
            query,
            source,
            node: this.node.identifier
        });
    }
    async stop() {
        (0, PlaybackGuard_1.playbackGuard)(this).invalidate();
        return this.commands.enqueue(() => (0, OpenTelemetry_1.observeOperation)(this.manager, 'nyxlink.player.stop', () => this.stopPlayback()));
    }
    async stopPlayback() {
        if (this.destroyed)
            return this;
        this.manager.emit("debug", `Moonlink.js > Player#stop -> Sending stop request to node ${this.node.identifier} for guild ${this.guildId}`);
        this.manager.emit("playerTriggeredStop", this);
        await this.sendPlayerUpdate({
            track: { encoded: null },
            ...(this.node.isNodeLink && this.nextTrack ? { nextTrack: null } : {})
        });
        const oldPlaying = this.playing;
        const oldPaused = this.paused;
        const oldTrackTitle = this.current?.title ?? "null";
        this.playing = false;
        this.paused = false;
        this.current = null;
        await this.updateData("playing", false);
        await this.updateData("paused", false);
        await this.updateData("current", null);
        this.manager.emit("debug", `NyxLink > Player#stop >> State changed: playing: ${oldPlaying} -> ${this.playing}, paused: ${oldPaused} -> ${this.paused}`);
        this.manager.emit("debug", `Moonlink.js > Player#stop >> Player state changed: current: ${oldTrackTitle} -> null`);
        this.manager.emit("debug", `Moonlink.js > Player#stop >> Player stopped for guild ${this.guildId}`);
        this.manager.emit("playerStop", this);
        return this;
    }
    async skip(position) {
        const oldTrack = this.current;
        if (position !== undefined) {
            if (!Number.isInteger(position) || position < 0 || !this.queue.get(position))
                return false;
            const guard = (0, PlaybackGuard_1.playbackGuard)(this);
            const ticket = guard.invalidate();
            return this.commands.enqueue(async () => {
                try {
                    if (this.destroyed || !guard.isCurrent(ticket))
                        return false;
                    const track = this.queue.get(position);
                    if (!track)
                        return false;
                    this.manager.emit("playerTriggeredSkip", this, this.current, track, position);
                    if (this.destroyed || !guard.isCurrent(ticket) || this.queue.get(position) !== track)
                        return false;
                    let playbackTrack;
                    try {
                        playbackTrack = track instanceof Track_1.Track ? track :
                            new Track_1.Track(track, undefined, undefined, this.manager.options.trackPartial ?? []);
                    }
                    catch (error) {
                        this.manager.emit("debug", `NyxLink > Player#skip >> Invalid queued track: ${error instanceof Error ? error.name : "unknown"}`);
                        return false;
                    }
                    const selected = this.queue.remove(position);
                    if (!selected)
                        return false;
                    const originalPosition = playbackTrack.position;
                    let injectedTrackQueued = false;
                    let played = false;
                    try {
                        played = await this.playNext({ track: playbackTrack }, ticket, () => true, queued => { injectedTrackQueued = queued; });
                        return played;
                    }
                    finally {
                        if (!played) {
                            playbackTrack.position = originalPosition;
                            if (injectedTrackQueued) {
                                const injectedIndex = this.queue.tracks.indexOf(playbackTrack);
                                if (injectedIndex >= 0)
                                    this.queue.remove(injectedIndex);
                            }
                            if (!this.destroyed && !this.manager.destroyed) {
                                this.queue.insert(Math.min(position, this.queue.size), selected);
                            }
                        }
                    }
                }
                finally {
                    (0, PlaybackAttempt_1.playbackAttempt)(this).retain(ticket);
                }
            });
        }
        if (!this.queue.size) {
            if (this.autoPlay) {
                if (!this.current) {
                    this.manager.emit("debug", `Moonlink.js > Player#skip >> Queue is empty and no current track, cannot trigger autoPlay for guild ${this.guildId}`);
                    return false;
                }
                this.manager.emit("debug", `Moonlink.js > Player#skip >> Queue empty, triggering autoPlay for guild ${this.guildId}`);
                return await this.node.handleAutoPlay(this, this.current);
            }
            this.manager.emit("debug", `Moonlink.js > Player#skip >> Queue is empty, stopping player for guild ${this.guildId}`);
            await this.stop();
            return true;
        }
        const nextTrack = this.queue.first;
        if (!nextTrack)
            return false;
        this.manager.emit("playerTriggeredSkip", this, oldTrack, nextTrack, 0);
        this.manager.emit("debug", `Moonlink.js > Player#skip -> Skipping to next track in queue for guild ${this.guildId}`);
        return await this.play();
    }
    async seek(position) {
        const ticket = (0, PlaybackGuard_1.playbackGuard)(this).ticket;
        const track = this.current;
        const afterPendingPlay = this.pendingPlayTicket === ticket;
        return this.commands.enqueue(() => (0, OpenTelemetry_1.observeOperation)(this.manager, 'nyxlink.player.seek', () => this.seekPlayback(position, ticket, track, afterPendingPlay)));
    }
    async seekPlayback(position, ticket, track, afterPendingPlay) {
        if (this.destroyed)
            return this;
        (0, Util_1.validate)(position, (v) => typeof v === "number" && Number.isFinite(v) && v >= 0, "Player#seek > Position must be a valid number.");
        const guard = (0, PlaybackGuard_1.playbackGuard)(this);
        if (!guard.isCurrent(ticket) ||
            (afterPendingPlay && this.lastSuccessfulExplicitPlayTicket !== ticket) ||
            (!afterPendingPlay && track !== null && this.current !== track))
            return this;
        const activeTrack = this.current;
        this.manager.emit("debug", `NyxLink > Player#seek -> Seeking to position ${position}ms for guild ${this.guildId}`);
        this.manager.emit("playerTriggeredSeek", this, position);
        await this.sendPlayerUpdate({ position });
        if (guard.isCurrent(ticket) && !this.destroyed && this.current === activeTrack && activeTrack) {
            activeTrack.position = position;
        }
        this.manager.emit("debug", `NyxLink > Player#seek >> Sent seek request to node ${this.node.identifier}`);
        return this;
    }
    setVolume(volume) {
        (0, Util_1.validate)(volume, (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000, "Player#setVolume > Volume must be between 0 and 1000.");
        this.optimisticVolumeRevision = ++this.volumeRevision;
        const oldVolume = this.volume;
        this.volume = volume;
        this.manager.emit("playerChangedVolume", this, oldVolume, volume);
        this.manager.emit("debug", `Moonlink.js > Player#setVolume -> Changing volume from ${oldVolume} to ${volume} for guild ${this.guildId}`);
        void this.commands.enqueue(async () => {
            if (this.destroyed)
                return;
            await this.sendPlayerUpdate({ volume });
        }).catch(error => {
            this.manager.emit("playerVolumeError", this, error, volume);
            this.manager.emit("debug", `NyxLink > Player#setVolume >> Volume update failed for guild ${this.guildId}: ${error.message}`);
        });
        this.updateData("volume", this.volume);
        this.manager.emit("debug", `Moonlink.js > Player#setVolume >> Volume updated for guild ${this.guildId}`);
        return this;
    }
    async setVolumeAsync(volume) {
        (0, Util_1.validate)(volume, v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000, "Player#setVolumeAsync > Volume must be between 0 and 1000.");
        const revision = ++this.volumeRevision;
        return this.commands.enqueue(async () => {
            if (this.destroyed)
                throw new Error("Cannot update volume on a destroyed player");
            const node = this.node, session = node.sessionId, socket = node.socket, backend = node.backend;
            const active = () => !this.destroyed && !this.manager.destroyed && !node.destroyed && node.connected &&
                this.node === node && node.sessionId === session && node.socket === socket && node.backend === backend;
            if (!active())
                throw new PlayerOperationCancelledError_1.PlayerOperationCancelledError('volume');
            try {
                await this.sendPlayerUpdate({ volume });
            }
            catch (error) {
                if (!active())
                    throw new PlayerOperationCancelledError_1.PlayerOperationCancelledError('volume');
                throw error;
            }
            if (!active())
                throw new PlayerOperationCancelledError_1.PlayerOperationCancelledError('volume');
            if (this.optimisticVolumeRevision > revision)
                return this;
            const oldVolume = this.volume;
            this.volume = volume;
            await this.updateData("volume", volume);
            this.manager.emit("playerChangedVolume", this, oldVolume, volume);
            return this;
        });
    }
    setLoop(loop, count) {
        const oldLoop = this.loop;
        const oldLoopCount = this.loopCount;
        this.loop = loop;
        this.loopCount = count;
        this.manager.emit("playerChangedLoop", this, oldLoop, this.loop, oldLoopCount, this.loopCount);
        this.updateData("loop", this.loop);
        this.updateData("loopCount", this.loopCount);
        this.manager.emit("debug", `Moonlink.js > Player#setLoop >> Loop mode changed from "${oldLoop}" to "${loop}"${count ? ` (count: ${count})` : ""} for guild ${this.guildId}`);
        return this;
    }
    setAutoPlay(autoPlay) {
        if (!autoPlay)
            (0, PlaybackGuard_1.playbackGuard)(this).cancelAutoPlay();
        this.autoPlay = autoPlay;
        this.manager.emit("playerAutoPlaySet", this, autoPlay);
        this.updateData("autoPlay", this.autoPlay);
        this.manager.emit("debug", `Moonlink.js > Player#setAutoPlay >> AutoPlay set to ${autoPlay} for guild ${this.guildId}`);
        return this;
    }
    setAutoLeave(autoLeave) {
        this.autoLeave = autoLeave;
        this.manager.emit("playerAutoLeaveSet", this, autoLeave);
        this.updateData("autoLeave", this.autoLeave);
        this.manager.emit("debug", `Moonlink.js > Player#setAutoLeave >> AutoLeave set to ${autoLeave} for guild ${this.guildId}`);
        return this;
    }
    shuffle() {
        if (this.queue.size < 2) {
            this.manager.emit("debug", `Moonlink.js > Player#shuffle >> Queue has less than 2 tracks, cannot shuffle for guild ${this.guildId}`);
            return this;
        }
        const oldQueue = [...this.queue.tracks];
        this.manager.emit("debug", `Moonlink.js > Player#shuffle -> Shuffling queue with ${this.queue.size} tracks for guild ${this.guildId}`);
        this.queue.shuffle();
        this.manager.emit("playerTriggeredShuffle", this, oldQueue, this.queue.tracks);
        this.manager.emit("debug", `Moonlink.js > Player#shuffle >> Queue shuffled for guild ${this.guildId}`);
        return this;
    }
    async destroy(reason) {
        if (this.destructionPromise)
            return this.destructionPromise;
        if (this.destroyed) {
            return;
        }
        (0, PlaybackGuard_1.playbackGuard)(this).invalidate();
        this.destroyed = true;
        this.node.cancelVoiceReconnect?.(this);
        const leased = this.manager.guildOwnership?.localLease(this.guildId);
        this.destructionPromise = this.commands.enqueue(() => this.destroyPlayback(reason))
            .finally(async () => {
            if (leased)
                await this.manager.guildOwnership?.release(this.guildId, leased);
        });
        if (!this.manager.guildOwnership)
            this.voice.destroy();
        this.stopHealthCheck();
        return this.destructionPromise;
    }
    async destroyPlayback(reason) {
        if (this.resumeDebounceTimer) {
            clearTimeout(this.resumeDebounceTimer);
            this.resumeDebounceTimer = undefined;
        }
        if (!reason) {
            const stack = new Error().stack?.split("\n").slice(2, 8).join("\n");
            this.manager.emit("debug", `Moonlink.js > Player#destroy >> Destroy called without reason for guild ${this.guildId}. Stack: ${stack || "unavailable"}`);
        }
        const destroyReason = reason ?? "No reason provided";
        this.manager.emit("debug", `Moonlink.js > Player#destroy -> Destroying player for guild ${this.guildId}. Reason: ${destroyReason}`);
        this.playing = false;
        this.paused = false;
        const owner = !this.manager.guildOwnership ||
            await this.manager.guildOwnership.isCurrent(this.guildId);
        if (owner)
            try {
                await this.disconnect();
            }
            catch (e) {
                this.manager.emit("debug", `Moonlink.js > Player#destroy >> Voice disconnection failed for guild ${this.guildId}: ${e.message}`);
            }
        if (owner)
            try {
                await this.node.rest.destroyPlayer(this.guildId);
            }
            catch (e) {
                this.manager.emit("debug", `Moonlink.js > Player#destroy >> Failed to destroy player on node: ${e.message}`);
            }
        this.current = null;
        this.queue.clear();
        this.previous = [];
        if (owner)
            this.updateData("previous", []);
        if (this.manager.players.get(this.guildId) === this) {
            this.manager.players.players.delete(this.guildId);
        }
        if (owner && (!this.manager.guildOwnership ||
            await this.manager.guildOwnership.isCurrent(this.guildId))) {
            await this.manager.database.remove(`players.${this.guildId}`);
        }
        this.manager.emit('playerDestroyed', this, reason);
        this.manager.emit("debug", `Moonlink.js > Player#destroy >> Player destroyed for guild ${this.guildId}.`);
    }
    async restart(options = {}) {
        const guard = (0, PlaybackGuard_1.playbackGuard)(this);
        const ticket = guard.ticket;
        const run = (operation) => options[PlayerMigration_1.migrationRestart] ? operation() : this.commands.enqueue(operation);
        if (this.destroyed)
            return false;
        this.manager.emit("debug", `Moonlink.js > Player#restart -> Restarting player for guild ${this.guildId}`);
        this.manager.emit("playerResuming", this);
        if (this.destroyed || !guard.isCurrent(ticket))
            return false;
        if (!this.voiceChannelId) {
            this.manager.emit("debug", `Moonlink.js > Player#restart >> Cannot restart player without a voiceChannelId for guild ${this.guildId}`);
            return false;
        }
        try {
            await this.connect();
        }
        catch (error) {
            this.manager.emit("debug", `Moonlink.js > Player#restart >> Voice connection failed for guild ${this.guildId}. Error: ${error.message}`);
            if (this.destroyed || !guard.isCurrent(ticket))
                return false;
            if (options.destroyOnFailure !== false)
                await this.destroy("Failed to establish voice connection on restart.");
            return false;
        }
        if (this.destroyed || !guard.isCurrent(ticket))
            return false;
        if (this.current) {
            const lastKnownPosition = this.get("lastKnownPosition");
            const lastState = this.get("lastState");
            const currentLavalinkPos = lastState?.position ?? 0;
            const isResumedSync = this.node.resumed && this.playing && currentLavalinkPos > 0;
            const isAlreadySync = !options[PlayerMigration_1.migrationRestart] && (isResumedSync || (lastState?.connected && Math.abs(currentLavalinkPos - (this.current.position ?? 0)) < 2000));
            if (isAlreadySync && this.playing) {
                this.manager.emit("debug", `Moonlink.js > Player#restart >> Player already in sync for guild ${this.guildId}, skipping track restoration. (Resumed: ${this.node.resumed}, Sync: ${isAlreadySync})`);
                this.manager.emit("playerResumed", this);
                return true;
            }
            const observed = this.current.position ?? 0;
            const resumePosition = options[PlayerMigration_1.migrationRestart] ? observed : Math.max(Number.isFinite(lastKnownPosition) ? lastKnownPosition : 0, Number.isFinite(currentLavalinkPos) ? currentLavalinkPos : 0, observed);
            this.manager.emit("debug", `Moonlink.js > Player#restart -> Restoring current track "${this.current.title}" for guild ${this.guildId} at ${resumePosition}ms. AlreadySync: ${isAlreadySync}`);
            const payload = {
                track: { encoded: this.current.encoded, userData: this.current.userData },
                volume: this.volume,
                playing: this.playing,
                paused: this.paused,
                filters: this.filters.toPayload()
            };
            if (resumePosition > 0 && this.current.getInfo().isSeekable && !isAlreadySync) {
                payload.position = resumePosition;
            }
            if (this.audioTrackId) {
                payload.track.audioTrackId = this.audioTrackId;
            }
            if (this.fading)
                payload.fading = this.fading;
            if (this.crossfade && this.node.isNodeLink)
                payload.crossfade = this.crossfade;
            if (this.queuePreload) {
                if (this.node.isNodeLink)
                    payload.nextTrack = null;
            }
            else if (this.nextTrack)
                payload.nextTrack = this.nextTrack;
            if (this.loudnessNormalizer !== undefined) {
                payload.loudnessNormalizer = this.loudnessNormalizer;
            }
            const restored = await run(async () => {
                if (this.destroyed || !guard.isCurrent(ticket))
                    return false;
                if (!await this.restoreVoiceForRestart(ticket))
                    return false;
                await this.sendPlayerUpdate(payload);
                return !this.destroyed && guard.isCurrent(ticket);
            });
            if (!restored)
                return false;
        }
        else if (this.queue.size > 0 && options.startQueued !== false) {
            this.manager.emit("debug", `Moonlink.js > Player#restart -> No current track, playing first from queue for guild ${this.guildId}`);
            if (!await run(async () => {
                if (!await this.restoreVoiceForRestart(ticket))
                    return false;
                return this.playNext({}, ticket);
            }).catch(() => false))
                return false;
        }
        else {
            if (options[PlayerMigration_1.migrationRestart]) {
                if (!await this.restoreVoiceForRestart(ticket))
                    return false;
                await this.sendPlayerUpdate({ filters: this.filters.toPayload(), volume: this.volume, paused: this.paused });
                if (this.destroyed || !guard.isCurrent(ticket))
                    return false;
            }
            this.manager.emit("debug", `Moonlink.js > Player#restart >> No track to restore and queue is empty for guild ${this.guildId}`);
            return true;
        }
        if (!options[PlayerMigration_1.migrationRestart])
            this.manager.emit("playerResumed", this);
        return true;
    }
    async restoreVoiceForRestart(ticket) {
        if (this.destroyed || !(0, PlaybackGuard_1.playbackGuard)(this).isCurrent(ticket))
            return false;
        const { sessionId, token, endpoint } = this.voice;
        if (!sessionId || !token || !endpoint)
            return false;
        await this.sendPlayerUpdate({ voice: { sessionId, token, endpoint, channelId: this.voiceChannelId } }, true);
        return !this.destroyed && (0, PlaybackGuard_1.playbackGuard)(this).isCurrent(ticket);
    }
    async transferNode(node) {
        const targetNode = typeof node === "string" ? this.manager.nodes.nodes.get(node) : node;
        if (this.destroyed || !targetNode || targetNode.manager !== this.manager || !NodeSelector_1.NodeSelector.matches(targetNode, this.nodeSelection) || targetNode.identifier === this.node.identifier)
            return false;
        this.node.cancelVoiceReconnect?.(this);
        const ticket = (0, PlaybackGuard_1.playbackGuard)(this).invalidate();
        return this.commands.enqueue(() => (0, PlayerMigration_1.migratePlayer)(this, targetNode, ticket));
    }
    setVoiceChannelId(voiceChannelId) {
        (0, Util_1.validate)(voiceChannelId, (v) => typeof v === "string" && v.length > 0, "Player#setVoiceChannelId > Voice channel ID must be a non-empty string.");
        if (this.voiceChannelId === voiceChannelId) {
            this.manager.emit("debug", `Moonlink.js > Player#setVoiceChannelId >> Voice channel already set to ${voiceChannelId} for guild ${this.guildId}`);
            return this;
        }
        this.node.cancelVoiceReconnect?.(this);
        const oldChannel = this.voiceChannelId;
        this.voiceChannelId = voiceChannelId;
        this.updateData("voiceChannelId", this.voiceChannelId);
        this.manager.emit("debug", `Moonlink.js > Player#setVoiceChannel >> Voice channel changed from ${oldChannel} to ${voiceChannelId} for guild ${this.guildId}`);
        this.manager.emit("playerVoiceChannelIdSet", this, oldChannel, voiceChannelId);
        return this;
    }
    setTextChannelId(textChannelId) {
        (0, Util_1.validate)(textChannelId, (v) => typeof v === "string" && v.length > 0, "Player#setTextChannelId > Text channel ID must be a non-empty string.");
        if (this.textChannelId === textChannelId) {
            this.manager.emit("debug", `Moonlink.js > Player#setTextChannelId >> Text channel already set to ${textChannelId} for guild ${this.guildId}`);
            return this;
        }
        const oldChannel = this.textChannelId;
        this.textChannelId = textChannelId;
        this.updateData("textChannelId", this.textChannelId);
        this.manager.emit("debug", `Moonlink.js > Player#setTextChannel >> Text channel changed from ${oldChannel} to ${textChannelId} for guild ${this.guildId}`);
        this.manager.emit("playerTextChannelIdSet", this, oldChannel, textChannelId);
        return this;
    }
    async replay() {
        if (!this.current?.encoded || this.destroyed)
            return false;
        const guard = (0, PlaybackGuard_1.playbackGuard)(this);
        const ticket = guard.invalidate();
        this.pendingPlayTicket = ticket;
        return this.commands.enqueue(async () => {
            if (this.destroyed || !guard.isCurrent(ticket))
                return false;
            const original = this.current;
            if (!original?.encoded)
                return false;
            const copy = new Track_1.Track(original.toJSON(), original.requester, original.origin, this.manager.options.trackPartial ?? []);
            let injectedTrackQueued = false;
            try {
                const played = await this.playNext({ track: copy, position: 0 }, ticket, () => true, queued => { injectedTrackQueued = queued; }, true);
                if (played)
                    this.lastSuccessfulExplicitPlayTicket = ticket;
                return played;
            }
            finally {
                if (injectedTrackQueued) {
                    const index = this.queue.tracks.indexOf(copy);
                    if (index >= 0)
                        this.queue.remove(index);
                }
            }
        }).finally(() => {
            if (this.pendingPlayTicket === ticket)
                this.pendingPlayTicket = undefined;
        });
    }
    async back() {
        if (this.destroyed || this.previous.length === 0)
            return false;
        const guard = (0, PlaybackGuard_1.playbackGuard)(this);
        const ticket = guard.invalidate();
        return this.commands.enqueue(async () => {
            if (this.destroyed || !guard.isCurrent(ticket))
                return false;
            const lastTrack = this.previous.at(-1);
            if (!lastTrack)
                return false;
            const outgoing = this.current;
            const priorBackFlag = this.get("isBackPlay") ?? false;
            const originalPreviousPosition = lastTrack.position;
            let injectedTrackQueued = false;
            let played = false;
            let committed = false;
            this.set("isBackPlay", true);
            try {
                played = await this.playNext({ track: lastTrack, position: 0 }, ticket, () => true, queued => { injectedTrackQueued = queued; });
                if (!played || !guard.isCurrent(ticket) || this.destroyed)
                    return false;
                const index = this.previous.lastIndexOf(lastTrack);
                if (index >= 0) {
                    this.previous.splice(index, 1);
                    this.updateData("previous", this.previous.map(track => TrackCodec_1.TrackCodec.serialize(track)));
                }
                if (outgoing)
                    this.queue.unshift(outgoing);
                committed = true;
                this.manager.emit("playerTriggeredBack", this, lastTrack);
                return true;
            }
            finally {
                if (injectedTrackQueued) {
                    const index = this.queue.tracks.indexOf(lastTrack);
                    if (index >= 0)
                        this.queue.remove(index);
                }
                if (!committed) {
                    lastTrack.position = originalPreviousPosition;
                    this.set("isBackPlay", priorBackFlag);
                }
            }
        });
    }
}
exports.Player = Player;
//# sourceMappingURL=Player.js.map