import { normalizeCrossfade, type CrossfadeOptions, type QueuePreloadOptions } from '../backends/NodeLinkContracts';
import { preparePlayerUpdate, type PlayerUpdatePayload, type PlayerVoiceUpdate } from '../backends/ProtocolContracts';
import { migratePlayer, migrationRestart, type RestartOptions } from "../players/PlayerMigration";
import { PlayerCommandQueue } from "../players/PlayerCommandQueue";
import { playbackGuard } from "../players/PlaybackGuard";
import { playbackAttempt } from "../players/PlaybackAttempt";
import { NodeSelector, type NodeRequirements } from '../nodes/NodeSelector';
import { Node } from "./Node";
import { Queue } from "./Queue";
import { Manager } from "../core/Manager";
import { Structure, validate, decodeTrack, delay, nodeLinkOnlyError, type NodeLinkResponse } from "../Util";
import { PlayerLoop, VoiceState } from "../typings/types";
import { IPlayerConfig, IFadingOptions, ILyricsData, IChapter, IMeaningResponse, IFilters } from "../typings/Interfaces";
import { Filters } from "./Filters";
import { Voice } from "./Voice";
import { Track } from "./Track";
import { TrackCodec } from '../tracks/TrackCodec';
import { TrackResolver } from '../tracks/TrackResolver';
import { VoiceReceiver, VoiceReceiverOptions } from "./VoiceReceiver";
import { PlayerSnapshotCodec, recordRevision, type PlayerSnapshot } from '../database/PlayerSnapshot';

export class Player {
    public readonly manager: Manager;
    public node: Node;
    public readonly nodeSelection: NodeRequirements;
    public readonly guildId: string;
    public readonly queue: Queue;
    public readonly filters: Filters;
    public readonly voice: Voice;
    public data: Record<string, unknown> = {};

    public voiceChannelId: string;
    public textChannelId: string;

    public playing: boolean = false;
    public paused: boolean = false;
    public connected: boolean = false;
    public destroyed: boolean = false;
    public volume: number = 100;
    public loop: PlayerLoop = "off";
    public loopCount?: number;
    public autoPlay: boolean = false;
    public autoLeave: boolean = false;
    public ping: number = -1;
    public isResuming: boolean = false;

    public current: Track | null = null;
    public previous: Track[] = [];
    public recommendations: Track[] = [];
    public historySize: number = 10;

    public lastActivityTime: number = Date.now();
    private readonly commands = new PlayerCommandQueue();
    private destructionPromise?: Promise<void>;
    /** Explicit play queued but not yet settled; seeks after it target that new play. */
    private pendingPlayTicket?: number;
    private lastSuccessfulExplicitPlayTicket?: number;
    private volumeRevision = 0;
    private optimisticVolumeRevision = 0;
    private fading?: IFadingOptions;
    private crossfade?: CrossfadeOptions;
    private nextTrack?: { encoded: string; userData?: Record<string, any> };
    private preloadOptions?: QueuePreloadOptions;
    private queuePreload?: { track: Track; node: Node; session: string };
    private preloadJob?: Promise<void>;
    /** Queue changes while a preload request is in flight need one reconciliation pass. */
    private preloadRefreshRequested = false;
    private preloadRetryAt = 0;
    private audioTrackId?: string;
    private loudnessNormalizer?: boolean;
    private endTime?: number;

    private healthCheckTimer?: NodeJS.Timeout;
    public lastPosition: number = 0;
    public lastPositionTime: number = Date.now();
    public stuckDetectionCount: number = 0;
    public silentDetectionCount: number = 0;
    private resumeDebounceTimer?: NodeJS.Timeout;
    private isResumeInProgress: boolean = false;
    private lastResumeAttempt: number = 0;

    constructor(manager: Manager, node: Node, config: IPlayerConfig) {
        NodeSelector.validate(config.nodeSelection);
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

        this.queue = new (Structure.get("Queue"))(this);
        this.filters = new (Structure.get("Filters"))(this);
        this.voice = new Voice(this);

        if (config.current) {
            this.current = TrackCodec.restore(config.current);
            // TrackCodec restores the explicit or embedded position, including zero.
            this.lastPosition = this.current.getInfo().position;
        }

        if (config.queue && Array.isArray(config.queue)) {
            for (const track of config.queue) {
                this.queue.add(TrackCodec.restore(track));
            }
        }

        if (config.previous && Array.isArray(config.previous)) {
            for (const track of config.previous) {
                this.previous.push(TrackCodec.restore(track));
            }
        }

        this.manager.emit("debug", `Moonlink.js > Player#constructor >> Player created for guild ${this.guildId} on node ${this.node.identifier} | autoPlay: ${this.autoPlay}, autoLeave: ${this.autoLeave}, loop: ${this.loop}`);

        this.startHealthCheck();
    }

    public startHealthCheck(): void {
        this.stopHealthCheck();
        const interval = this.manager.options.playerHealth?.checkInterval ?? 30000;

        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck();
        }, interval);
    }

    public stopHealthCheck(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }
    }

    private async performHealthCheck(): Promise<void> {
        if (this.destroyed || !this.connected) return;

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
            } else {
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
            } else {
                this.silentDetectionCount = 0;
            }

            this.lastPosition = currentPosition;
            this.lastPositionTime = now;
        } else {
            this.stuckDetectionCount = 0;
            this.silentDetectionCount = 0;
        }
    }

    private async recoverFromStuck(): Promise<void> {
        if (this.destroyed) return;
        let ticket = playbackGuard(this).ticket;

        this.manager.emit("playerRecoveryStarted", this);

        try {
            if (this.current && this.current.getInfo().isSeekable) {
                const seekPos = Math.max(0, (this.current.position ?? 0) + 2000);
                this.manager.emit("debug", `Moonlink.js > Player#recoverFromStuck >> Seeking forward 2s for player ${this.guildId}.`);
                await this.seek(seekPos);
            } else {
                const restoring = this.softRestart("Stuck player recovery");
                ticket = playbackGuard(this).ticket;
                if (!await restoring) {
                    throw new Error("Soft restart did not restore playback");
                }
            }
            if (this.destroyed || !playbackGuard(this).isCurrent(ticket)) return;
            this.manager.emit("playerRecoverySuccess", this);
        } catch (error) {
            this.manager.emit("debug", `Moonlink.js > Player#recoverFromStuck >> Recovery failed: ${(error as Error).message}`);
            this.manager.emit("playerRecoveryFailed", this);
        }
    }

    public async softRestart(reason: string): Promise<boolean> {
        if (this.destroyed) return false;

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
            const ticket = playbackGuard(this).ticket;
            await stopping;
            if (this.destroyed || !playbackGuard(this).isCurrent(ticket)) return false;

            await new Promise(resolve => setTimeout(resolve, 500));
            if (this.destroyed || !playbackGuard(this).isCurrent(ticket)) return false;

            if (this.voice.sessionId && this.voice.token && this.voice.endpoint) {
                const voicePayload: any = {
                    sessionId: this.voice.sessionId,
                    token: this.voice.token,
                    endpoint: this.voice.endpoint
                };
                if (this.node.isNodeLink) {
                    voicePayload.channelId = this.voiceChannelId;
                }
                await this.updatePlayer({ voice: voicePayload }, true);
            }

            if (this.destroyed || !playbackGuard(this).isCurrent(ticket)) return false;
            const restored = await this.commands.enqueue(() => this.playNext({
                track: currentTrack,
                position: currentPosition,
                noReplace: false
            }, ticket));
            if (!restored) return false;
            if (this.destroyed || !playbackGuard(this).isCurrent(ticket)) return false;

            if (wasPaused) {
                await this.pause();
            }
            if (this.destroyed || !playbackGuard(this).isCurrent(ticket)) return false;

            this.stuckDetectionCount = 0;
            this.silentDetectionCount = 0;
            this.lastPosition = currentPosition;
            this.lastPositionTime = Date.now();
            this.updateActivity();

            this.manager.emit("debug", `Moonlink.js > Player#softRestart >> Soft restart completed for player ${this.guildId}.`);
            return true;
        } catch (error) {
            this.manager.emit("debug", `Moonlink.js > Player#softRestart >> Soft restart failed: ${(error as Error).message}`);
            return false;
        }
    }

    public updateActivity(): void {
        this.lastActivityTime = Date.now();
    }

    public set(key: string, value: unknown): this {
        this.data[key] = value;
        return this;
    }

    public get<T>(key: string): T | undefined {
        return this.data[key] as T;
    }

    public updateData<T>(path?: string, data?: T): Promise<void> {
        const dbPath = `players.${this.guildId}${path ? `.${path}` : ''}`;
        const operation = this.manager.database.set(dbPath, data);
        // Background writes report failures; callers that await still receive rejection.
        void operation.catch(error => this.manager.emit('debug', `NyxLink > Storage > Write failed for ${dbPath}: ${error.message}`));
        return operation;
    }

    public exportSnapshot(): Promise<PlayerSnapshot> {
        return this.commands.enqueue(async () => {
            if (this.destroyed) throw new Error('Cannot export a destroyed player');
            const record = await this.manager.database.get(`players.${this.guildId}`);
            if (this.destroyed) throw new Error('Cannot export a destroyed player');
            return PlayerSnapshotCodec.capture(this, recordRevision(record));
        });
    }

    private assertNodeLinkFeature(feature: string): void {
        this.node.assertFeature(feature);
    }

    private resolveEncodedTrack(track: Track | string): string {
        if (track instanceof Track) return track.encoded;
        if (typeof track === "string" && track.length > 0) return track;
        throw new Error("Invalid track input. Provide a Track instance or encoded string.");
    }

    private async sendPlayerUpdate(payload: PlayerUpdatePayload, noReplace?: boolean, reservedTrack?: Track): Promise<any> {
        await this.manager.guildOwnership?.assertCurrent(this.guildId);
        const finalPayload = this.node.backend
            ? this.node.backend.preparePlayerUpdate(payload, this.voiceChannelId)
            : preparePlayerUpdate(this.node.isNodeLink ? 'nodelink' : 'unknown', payload, this.voiceChannelId);

        const attempts = playbackAttempt(this);
        const attempt = typeof payload.track?.encoded === 'string' ? attempts.begin(this.node, { ...payload.track, encoded: payload.track.encoded }, typeof payload.paused === 'boolean') : undefined;
        if (attempt) finalPayload.track = attempt.track;
        const preload = typeof payload.nextTrack?.encoded === 'string' || payload.nextTrack === null ? attempts.preload(this.node, payload.nextTrack) : undefined;
        if (preload) finalPayload.nextTrack = preload.track;
        const previousReservation = this.queuePreload;
        const reservation = reservedTrack ? { track: reservedTrack, node: this.node, session: this.node.sessionId } : undefined;
        if (preload) this.queuePreload = reservation;
        let acknowledged = false;
        try {
            const response = await this.node.rest.updatePlayer(this.guildId, finalPayload, noReplace);
            if (response == null) throw new Error("Backend did not acknowledge player update");
            acknowledged = true;
            if (attempt && !attempt.accepted(response)) throw new Error("Backend did not accept the requested track");
            if (preload && !this.destroyed) {
                if (payload.nextTrack === null) this.nextTrack = undefined;
                else if (preload.pending() && payload.nextTrack) this.nextTrack = structuredClone(payload.nextTrack);
            }
            return response;
        } catch (error) {
            attempt?.rollback();
            if (!acknowledged) {
                const restoreReservation = preload && this.queuePreload === reservation && (!reservation || preload.pending());
                preload?.rollback();
                if (restoreReservation) this.queuePreload = previousReservation;
            }
            throw error;
        }
    }

    /** Sends a raw updatePlayer payload with NodeLink extras applied when supported. */
    public async updatePlayer(payload: PlayerUpdatePayload, noReplace?: boolean): Promise<any> {
        return this.commands.enqueue(() => {
            if (this.destroyed) throw new Error("Cannot update a destroyed player");
            return this.sendPlayerUpdate(payload, noReplace);
        });
    }

    /** Voice credentials complete connect(), which playback may already be awaiting. */
    public async updateVoice(voice: PlayerVoiceUpdate): Promise<any> {
        if (this.destroyed) throw new Error("Cannot update voice on a destroyed player");
        return this.sendPlayerUpdate({ voice }, true);
    }

    public async connect({ selfDeaf, selfMute }: { selfDeaf?: boolean; selfMute?: boolean } = {}): Promise<this> {
        await this.manager.guildOwnership?.assertCurrent(this.guildId);
        this.node.cancelVoiceReconnect?.(this);
        const connectStack = new Error().stack?.split("\n").slice(2, 8).join("\n");
        this.manager.emit("debug", `Moonlink.js > Player#connect -> Connect requested for guild ${this.guildId}. Stack: ${connectStack || "unavailable"}`);
        this.set("userInitiatedConnect", true);
        if (selfDeaf !== undefined) this.set("selfDeaf", selfDeaf);
        if (selfMute !== undefined) this.set("selfMute", selfMute);
        await this.voice.connect({ selfDeaf: this.get("selfDeaf") ?? true, selfMute: this.get("selfMute") ?? false });
        return this;
    }

    public async disconnect(): Promise<this> {
        this.node.cancelVoiceReconnect?.(this);
        const disconnectStack = new Error().stack?.split("\n").slice(2, 8).join("\n");
        this.manager.emit("debug", `Moonlink.js > Player#disconnect -> Disconnect requested for guild ${this.guildId}. Stack: ${disconnectStack || "unavailable"}`);
        this.set("userInitiatedConnect", false);
        await this.voice.disconnect();
        return this;
    }

    public async play(options: { track?: Track; encoded?: string, requester?: any, position?: number, noReplace?: boolean, audioTrackId?: string } | Track = {}): Promise<boolean> {
        const ticket = playbackGuard(this).invalidate();
        this.pendingPlayTicket = ticket;
        return this.commands.enqueue(async () => {
            const played = await this.playNext(options, ticket);
            if (played) this.lastSuccessfulExplicitPlayTicket = ticket;
            return played;
        }).finally(() => {
            if (this.pendingPlayTicket === ticket) this.pendingPlayTicket = undefined;
        });
    }

    /** @internal Automatic playback retains the intent that resolved its recommendations. */
    public async playAutoPlay(track: Track, ticket: number, automaticTicket: number): Promise<boolean> {
        return this.commands.enqueue(async () => {
            // A user may enqueue music after autoplay chooses a candidate but
            // before its command runs. Never insert an automatic track ahead of it.
            if (this.queue.size > 0) return false;
            let automaticTrackQueued = false;
            const markAutomaticQueue = (queued: boolean) => { automaticTrackQueued = queued; };
            try {
                return await this.playNext({ track }, ticket,
                    () => this.autoPlay && playbackGuard(this).isAutoCurrent(automaticTicket),
                    markAutomaticQueue);
            } finally {
                // Remove only an insertion owned by this automatic attempt.
                // Once shifted for playback, another reference to the same
                // Track could have been manually queued and must be preserved.
                if (automaticTrackQueued) {
                    const index = this.queue.tracks.indexOf(track);
                    if (index >= 0) this.queue.remove(index);
                }
            }
        });
    }

    private async playNext(options: { track?: Track; encoded?: string, requester?: any, position?: number, noReplace?: boolean, audioTrackId?: string } | Track, ticket: number, allowed = () => true, onInjectedQueueChange?: (queued: boolean) => void, suppressHistory = false): Promise<boolean> {
        try {
            return await this.applyPlayback(options, ticket, allowed, onInjectedQueueChange, suppressHistory);
        } finally {
            playbackAttempt(this).retain(ticket);
        }
    }

    private async applyPlayback(options: { track?: Track; encoded?: string, requester?: any, position?: number, noReplace?: boolean, audioTrackId?: string } | Track, ticket: number, allowed: () => boolean, onInjectedQueueChange?: (queued: boolean) => void, suppressHistory = false): Promise<boolean> {
        const guard = playbackGuard(this);
        if (this.destroyed || !guard.isCurrent(ticket) || !allowed()) return false;
        this.recommendations = [];
        let finalOptions: { track?: Track; encoded?: string, requester?: any, position?: number, noReplace?: boolean, audioTrackId?: string };

        if (options instanceof Track) {
            finalOptions = { track: options };
        } else if ('encoded' in options && 'info' in options) {
            finalOptions = { track: options as any };
        } else {
            finalOptions = options;
        }

        this.manager.emit("debug", `NyxLink > Player#play -> Playback requested for guild ${this.guildId}. Explicit track: ${Boolean(finalOptions.track || finalOptions.encoded)}`);

        if (!this.voice.sessionId || !this.voice.endpoint) {
            this.manager.emit("debug", `Moonlink.js > Player#play >> Voice not ready for guild ${this.guildId}, attempting to connect...`);
            try {
                await this.connect();
            } catch (e) {
                this.manager.emit("debug", `Moonlink.js > Player#play >> Failed to connect voice: ${e}`);
                return false;
            }
        }

        if (!guard.isCurrent(ticket) || this.destroyed || !allowed()) return false;

        let track = finalOptions.track;
        if (finalOptions.encoded) {
            try {
                const decoded = decodeTrack(finalOptions.encoded);
                track = new Track(decoded, finalOptions.requester, undefined, this.manager.options.trackPartial ?? []);
            } catch (e) {
                this.manager.emit("debug", `Moonlink.js > Player#play >> Error decoding track for guild ${this.guildId}. Error: ${e}`);
                return false;
            }
        }

        if (track && !(track instanceof Track)) {
            try {
                track = new Track(track as any, finalOptions.requester, undefined, this.manager.options.trackPartial ?? []);
            } catch (e) {
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

        try { nextTrack = await TrackResolver.resolve(nextTrack, this.node); }
        catch (error) {
            this.manager.emit('debug', `NyxLink > TrackResolver > ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
        if (this.destroyed || !guard.isCurrent(ticket) || !allowed() || this.queue.first !== queuedTrack) return false;
        this.queue.shift();
        onInjectedQueueChange?.(false);

        const oldTrackTitle = this.current?.title ?? "null";
        this.current = nextTrack instanceof Track ? nextTrack : new Track(nextTrack, undefined, undefined, this.manager.options.trackPartial ?? []);
        this.current.position = finalOptions.position || 0;
        this.updateData("current", TrackCodec.serialize(this.current));
        this.manager.emit("debug", `Moonlink.js > Player#play >> Player state changed: current track: ${oldTrackTitle} -> ${this.current.title}`);

        const oldPlaying = this.playing;
        const oldPaused = this.paused;
        this.playing = true;
        this.paused = false;
        this.updateData("playing", this.playing);
        this.updateData("paused", this.paused);

        const audioTrackId = finalOptions.audioTrackId ?? this.audioTrackId;
        const payload: any = {
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

        if (this.fading) payload.fading = this.fading;
        if (this.crossfade && this.node.isNodeLink) payload.crossfade = this.crossfade;
        if (this.queuePreload) {
            if (this.node.isNodeLink) payload.nextTrack = null;
        } else if (this.nextTrack) payload.nextTrack = this.nextTrack;
        if (this.loudnessNormalizer !== undefined) {
            payload.loudnessNormalizer = this.loudnessNormalizer;
        }

        this.manager.emit("playerTriggeredPlay", this, this.current);
        this.manager.emit("debug", `NyxLink > Player#play -> Sending play request to node ${this.node.identifier} for guild ${this.guildId}.`);

        try {
            const response = await this.sendPlayerUpdate(payload, finalOptions.noReplace ?? this.manager.options.noReplace);
            if (response == null) throw new Error("Backend did not acknowledge playback");
            if (!guard.isCurrent(ticket) || this.destroyed) return false;
            this.manager.emit("debug", `Moonlink.js > Player#play >> Successfully sent play request for track "${this.current.title}" for guild ${this.guildId}`);
        } catch (e) {
            this.manager.emit("debug", `Moonlink.js > Player#play >> CRITICAL: Failed to send play request for guild ${this.guildId}. Reverting state. Error: ${(e as Error).message}`);
            this.playing = oldPlaying;
            this.paused = oldPaused;
            this.current = previousTrack;
            this.updateData("current", previousTrack ? TrackCodec.serialize(previousTrack) : null);
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
            this.updateData("previous", this.previous.map(t => TrackCodec.serialize(t)));
            this.manager.emit("debug", `Moonlink.js > Player#play << Added track "${previousTrack.title}" to history for guild ${this.guildId}. History size: ${this.previous.length}`);
        }
        this.set("isBackPlay", false);

        this.playing = true;
        this.paused = false;

        this.manager.emit("debug", `Moonlink.js > Player#play >> Player state changed: playing: ${oldPlaying} -> ${this.playing}, paused: ${oldPaused} -> ${this.paused}`);


        this.node.updateRecommendations(this).catch(() => {});

        return true;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async addMix(track: Track | string, options?: { volume?: number; userData?: Record<string, any> }): Promise<any | null> {
        this.assertNodeLinkFeature("mix:add");
        const encoded = this.resolveEncodedTrack(track);
        return this.node.rest.addMixLayer(this.guildId, {
            track: { encoded, userData: options?.userData },
            volume: options?.volume
        });
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async getMixes(): Promise<any | null> {
        this.assertNodeLinkFeature("mix:list");
        return this.node.rest.getMixLayers(this.guildId);
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async updateMixVolume(mixId: string, volume: number): Promise<this> {
        this.assertNodeLinkFeature("mix:update");
        await this.node.rest.updateMixLayerVolume(this.guildId, mixId, volume);
        return this;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async removeMix(mixId: string): Promise<this> {
        this.assertNodeLinkFeature("mix:remove");
        await this.node.rest.removeMixLayer(this.guildId, mixId);
        return this;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async subscribeLyrics(options?: { skipTrackSource?: boolean }): Promise<this> {
        this.assertNodeLinkFeature("lyrics:subscribe");
        await this.node.rest.subscribeLyrics(this.guildId, options?.skipTrackSource);
        return this;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async unsubscribeLyrics(): Promise<this> {
        this.assertNodeLinkFeature("lyrics:unsubscribe");
        await this.node.rest.unsubscribeLyrics(this.guildId);
        return this;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async loadChapters(encodedTrack?: string): Promise<NodeLinkResponse<IChapter[]> | null> {
        this.assertNodeLinkFeature("chapters");
        const target = encodedTrack ?? this.current?.encoded;
        if (!target) {
            throw new Error("loadChapters requires an encoded track or an active player track.");
        }
        return this.node.rest.loadChapters(target);
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async loadMeaning(encodedTrack?: string, lang?: string): Promise<NodeLinkResponse<IMeaningResponse | Record<string, any>> | null> {
        this.assertNodeLinkFeature("meaning");
        const target = encodedTrack ?? this.current?.encoded;
        if (!target) {
            throw new Error("loadMeaning requires an encoded track or an active player track.");
        }
        return this.node.rest.loadMeaning(target, lang);
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async getLoadDirectStream(options?: { volume?: number; position?: number; filters?: IFilters | Record<string, any> }): Promise<{ stream: NodeJS.ReadableStream; headers: Record<string, any> }> {
        this.assertNodeLinkFeature("loadstream");
        const target = this.current?.encoded;
        if (!target) {
            throw new Error("getLoadDirectStream requires an active player track.");
        }
        return this.node.loadDirectStream(target, options?.volume, options?.position, options?.filters);
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async getDirectStream(itag?: number | null): Promise<any | null> {
        this.assertNodeLinkFeature("trackstream");
        const target = this.current?.encoded;
        if (!target) {
            throw new Error("getDirectStream requires an active player track.");
        }
        return this.node.getDirectStream(target, itag);
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async setFading(fading: IFadingOptions): Promise<this> {
        const config = structuredClone(fading);
        return this.commands.enqueue(async () => {
            if (this.destroyed) throw new Error("Cannot update a destroyed player");
            this.assertNodeLinkFeature("fading");
            await this.sendPlayerUpdate({ fading: config });
            if (!this.destroyed) this.fading = config;
            return this;
        });
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async clearFading(): Promise<this> {
        return this.setFading({ enabled: false });
    }

    /** Last acknowledged crossfade request, not an assertion of active audio mixing. */
    public getCrossfade(): CrossfadeOptions | undefined {
        return this.crossfade ? { ...this.crossfade } : undefined;
    }

    public async setCrossfade(options: CrossfadeOptions): Promise<this> {
        const config = normalizeCrossfade(options);
        return this.commands.enqueue(async () => {
            if (this.destroyed) throw new Error("Cannot update a destroyed player");
            this.assertNodeLinkFeature("crossfade");
            await this.sendPlayerUpdate({ crossfade: config });
            if (!this.destroyed) {
                this.crossfade = config;
                this.requestQueuePreload();
            }
            return this;
        });
    }

    public async clearCrossfade(): Promise<this> {
        return this.setCrossfade({ enabled: false });
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async setNextTrack(track: Track | string, userData?: Record<string, any>): Promise<this> {
        const encoded = this.resolveEncodedTrack(track);
        return this.commands.enqueue(async () => {
            if (this.destroyed) throw new Error("Cannot update a destroyed player");
            this.assertNodeLinkFeature("nextTrack");
            const nextTrack = { encoded, userData: userData ?? (track instanceof Track ? track.userData : undefined) };
            await this.sendPlayerUpdate({ nextTrack });
            return this;
        });
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async clearNextTrack(): Promise<this> {
        return this.commands.enqueue(async () => {
            if (this.destroyed) throw new Error("Cannot update a destroyed player");
            this.assertNodeLinkFeature("nextTrack");
            await this.sendPlayerUpdate({ nextTrack: null });
            return this;
        });
    }

    /** Last acknowledged pending preload; consumed tracks are no longer returned. */
    public getNextTrack(): { encoded: string; userData?: Record<string, unknown> } | undefined {
        return this.nextTrack ? structuredClone(this.nextTrack) : undefined;
    }

    /** Optional queue-aware preparation; enabled explicitly after configuring crossfade. */
    public setQueuePreload(options: QueuePreloadOptions): this {
        if (!options || typeof options.enabled !== 'boolean' ||
            options.leadMs !== undefined && (!Number.isSafeInteger(options.leadMs) || options.leadMs < 1000 || options.leadMs > 120000)) {
            throw new TypeError('Invalid queue preload options');
        }
        this.preloadOptions = { enabled: options.enabled, leadMs: options.leadMs ?? 35000 };
        this.requestQueuePreload();
        return this;
    }

    /** @internal Coalesces queue/position changes into the existing player command queue. */
    public requestQueuePreload(): void {
        if (this.destroyed || this.manager.destroyed || (!this.preloadOptions?.enabled && !this.queuePreload)) return;
        if (this.preloadJob) {
            this.preloadRefreshRequested = true;
            return;
        }
        const ticket = playbackGuard(this).ticket;
        const node = this.node;
        const session = node.sessionId;
        const active = () => !this.destroyed && !this.manager.destroyed && this.node === node &&
            node.connected && !node.destroyed && node.sessionId === session && playbackGuard(this).isCurrent(ticket);
        const desired = (): Track | undefined => {
            const current = this.current;
            const next = this.queue.first;
            if (!active() || !node.isNodeLink || node.backend?.featureStatus('nextTrack') === 'unavailable' ||
                !this.preloadOptions?.enabled || !this.crossfade?.enabled || this.loop !== 'off' || !this.playing ||
                !current || !next || next === current || next.encoded === current.encoded) return undefined;
            const info = current.getInfo();
            const remaining = info.length - info.position;
            if (info.isStream || !Number.isFinite(remaining) || remaining <= 0 ||
                remaining > (this.preloadOptions.leadMs ?? 35000)) return undefined;
            return next;
        };
        const operation = this.commands.enqueue(async () => {
            if (!active() || Date.now() < this.preloadRetryAt) return;
            const reservation = this.queuePreload;
            if (reservation && (reservation.node !== node || reservation.session !== session)) {
                this.queuePreload = undefined;
                this.nextTrack = undefined;
            }
            if (!node.isNodeLink) return;
            let candidate = desired();
            if (this.queuePreload) {
                if (this.queuePreload.track === candidate) return;
                await this.sendPlayerUpdate({ nextTrack: null });
                candidate = desired();
            }
            if (!candidate || this.paused || this.nextTrack) return;
            const current = this.current;
            const resolved = await TrackResolver.resolve(candidate, node);
            if (this.current !== current || desired() !== candidate || this.paused || this.nextTrack) return;
            await this.sendPlayerUpdate({ nextTrack: { encoded: resolved.encoded, userData: resolved.userData } }, undefined, candidate);
        }).catch(() => {
            // Avoid retry storms from frequent position updates on an incompatible server.
            this.preloadRetryAt = Date.now() + 10000;
            this.manager.emit('debug', 'NyxLink > Queue preload request failed');
        }).finally(() => {
            if (this.preloadJob !== operation) return;
            this.preloadJob = undefined;
            if (this.preloadRefreshRequested) {
                this.preloadRefreshRequested = false;
                this.requestQueuePreload();
            }
        });
        this.preloadJob = operation;
    }

    /** @internal Called only after PlaybackAttempt accepts a preloaded TrackStart. */
    public consumePreloadedTrack(): void {
        const reservation = this.queuePreload;
        this.queuePreload = undefined;
        this.nextTrack = undefined;
        if (reservation && reservation.node === this.node && reservation.session === this.node.sessionId) {
            const index = this.queue.tracks.indexOf(reservation.track);
            if (index !== -1) this.queue.remove(index);
            if (this.current) {
                this.previous.push(this.current);
                const limit = this.manager.options.queue?.historyLimit ?? this.historySize;
                if (this.previous.length > limit) this.previous.shift();
                this.updateData('previous', this.previous.map(track => TrackCodec.serialize(track)));
            }
        }
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public setAudioTrackId(audioTrackId?: string): this {
        this.assertNodeLinkFeature("audioTrackId");
        this.audioTrackId = audioTrackId;
        return this;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async setLoudnessNormalizer(enabled: boolean): Promise<this> {
        if (typeof enabled !== 'boolean') throw new TypeError('Invalid loudness normalizer state');
        return this.commands.enqueue(async () => {
            if (this.destroyed) throw new Error("Cannot update a destroyed player");
            this.assertNodeLinkFeature("loudnessNormalizer");
            await this.sendPlayerUpdate({ loudnessNormalizer: enabled });
            if (!this.destroyed) this.loudnessNormalizer = enabled;
            return this;
        });
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public createVoiceReceiver(options?: VoiceReceiverOptions): VoiceReceiver {
        this.assertNodeLinkFeature("voiceReceive");
        return new VoiceReceiver(this.node, this.guildId, options);
    }

    public async pause(): Promise<this> {
        return this.commands.enqueue(() => this.pausePlayback());
    }

    private async pausePlayback(): Promise<this> {
        if (this.destroyed) return this;
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

    public async resume(options?: { timeout?: number }): Promise<this> {
        const pending = this.commands.enqueue(() => this.resumePlayback());
        if (!options?.timeout) return pending;
        let timer: NodeJS.Timeout;
        try {
            return await Promise.race([
                pending,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error("Resume timed out")), options.timeout);
                })
            ]);
        } finally {
            clearTimeout(timer!);
        }
    }

    private async resumePlayback(): Promise<this> {
        if (this.destroyed) return this;
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
        } finally {
            this.isResumeInProgress = false;
        }

        return this;
    }

    public async forward(ms: number): Promise<this> {
        if (!this.current) return this;
        const newPosition = Math.min(this.current.getInfo().length, this.current.getInfo().position + ms);
        return this.seek(newPosition);
    }

    public async rewind(ms: number): Promise<this> {
        if (!this.current) return this;
        const newPosition = Math.max(0, this.current.getInfo().position - ms);
        return this.seek(newPosition);
    }

    public async setVoiceState(state: { channelId?: string; selfMute?: boolean; selfDeaf?: boolean }): Promise<this> {
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

    public async toggleMute(): Promise<this> {
        return this.setVoiceState({ selfMute: !this.get("selfMute") });
    }

    public async toggleDeaf(): Promise<this> {
        return this.setVoiceState({ selfDeaf: !this.get("selfDeaf") });
    }

    public async search(query: string, source?: string): Promise<any> {
        return this.manager.search({
            query,
            source,
            node: this.node.identifier
        });
    }

    public async stop(): Promise<this> {
        playbackGuard(this).invalidate();
        return this.commands.enqueue(() => this.stopPlayback());
    }

    private async stopPlayback(): Promise<this> {
        if (this.destroyed) return this;
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
        // Wait for the stop state to be persisted before resolving the command.
        // Serialize these writes for adapters where set() rewrites a shared record.
        await this.updateData("playing", false);
        await this.updateData("paused", false);
        await this.updateData("current", null);
        this.manager.emit("debug", `NyxLink > Player#stop >> State changed: playing: ${oldPlaying} -> ${this.playing}, paused: ${oldPaused} -> ${this.paused}`);

        this.manager.emit("debug", `Moonlink.js > Player#stop >> Player state changed: current: ${oldTrackTitle} -> null`);

        this.manager.emit("debug", `Moonlink.js > Player#stop >> Player stopped for guild ${this.guildId}`);
        this.manager.emit("playerStop", this);
        return this;
    }

    public async skip(position?: number): Promise<boolean> {
        const oldTrack = this.current;
        if (position !== undefined) {
            if (!Number.isInteger(position) || position < 0 || !this.queue.get(position)) return false;
            const guard = playbackGuard(this);
            const ticket = guard.invalidate();
            return this.commands.enqueue(async () => {
                try {
                    if (this.destroyed || !guard.isCurrent(ticket)) return false;
                    const track = this.queue.get(position);
                    if (!track) return false;
                    this.manager.emit("playerTriggeredSkip", this, this.current, track, position);
                    if (this.destroyed || !guard.isCurrent(ticket) || this.queue.get(position) !== track) return false;
                    // Keep a selected queue entry recoverable until playback is
                    // acknowledged; an unsuccessful positional skip must not
                    // silently change the order of the user's remaining tracks.
                    const selected = this.queue.remove(position);
                    if (!selected) return false;
                    const playbackTrack = selected instanceof Track ? selected :
                        new Track(selected, undefined, undefined, this.manager.options.trackPartial ?? []);
                    let injectedTrackQueued = false;
                    let played = false;
                    try {
                        played = await this.playNext({ track: playbackTrack }, ticket, () => true,
                            queued => { injectedTrackQueued = queued; });
                        return played;
                    } finally {
                        if (!played) {
                            // playNext may have requeued its injected track after
                            // a rejected REST response. Remove that insertion
                            // before restoring the original position.
                            if (injectedTrackQueued) {
                                const injectedIndex = this.queue.tracks.indexOf(playbackTrack);
                                if (injectedIndex >= 0) this.queue.remove(injectedIndex);
                            }
                            if (!this.destroyed && !this.manager.destroyed) {
                                this.queue.insert(Math.min(position, this.queue.size), selected);
                            }
                        }
                    }
                } finally {
                    playbackAttempt(this).retain(ticket);
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
        if (!nextTrack) return false;
        this.manager.emit("playerTriggeredSkip", this, oldTrack, nextTrack, 0);
        this.manager.emit("debug", `Moonlink.js > Player#skip -> Skipping to next track in queue for guild ${this.guildId}`);
        return await this.play();
    }

    public async seek(position: number): Promise<this> {
        const ticket = playbackGuard(this).ticket;
        const track = this.current;
        const afterPendingPlay = this.pendingPlayTicket === ticket;
        return this.commands.enqueue(() => this.seekPlayback(position, ticket, track, afterPendingPlay));
    }

    private async seekPlayback(position: number, ticket: number, track: Track | null, afterPendingPlay: boolean): Promise<this> {
        if (this.destroyed) return this;
        validate(
            position,
            (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
            "Player#seek > Position must be a valid number."
        );

        // Reject seeks for stale playback intents, unless this seek was issued
        // immediately after the explicit play which replaces the captured track.
        const guard = playbackGuard(this);
        if (!guard.isCurrent(ticket) ||
            (afterPendingPlay && this.lastSuccessfulExplicitPlayTicket !== ticket) ||
            (!afterPendingPlay && track !== null && this.current !== track)) return this;

        const activeTrack = this.current;
        this.manager.emit("debug", `NyxLink > Player#seek -> Seeking to position ${position}ms for guild ${this.guildId}`);
        this.manager.emit("playerTriggeredSeek", this, position);
        await this.sendPlayerUpdate({ position });
        // A subsequent playback intent may have superseded this seek while HTTP was in flight.
        if (guard.isCurrent(ticket) && !this.destroyed && this.current === activeTrack && activeTrack) {
            activeTrack.position = position;
        }
        this.manager.emit("debug", `NyxLink > Player#seek >> Sent seek request to node ${this.node.identifier}`);

        return this;
    }

    public setVolume(volume: number): this {
        validate(
            volume,
            (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000,
            "Player#setVolume > Volume must be between 0 and 1000."
        );

        this.optimisticVolumeRevision = ++this.volumeRevision;
        const oldVolume = this.volume;
        this.volume = volume;
        this.manager.emit("playerChangedVolume", this, oldVolume, volume);

        this.manager.emit("debug", `Moonlink.js > Player#setVolume -> Changing volume from ${oldVolume} to ${volume} for guild ${this.guildId}`);
        void this.commands.enqueue(async () => {
            if (this.destroyed) return;
            await this.sendPlayerUpdate({ volume });
        }).catch(error => {
            this.manager.emit("playerVolumeError", this, error, volume);
            this.manager.emit("debug", `NyxLink > Player#setVolume >> Volume update failed for guild ${this.guildId}: ${error.message}`);
        });
        this.updateData("volume", this.volume);
        this.manager.emit("debug", `Moonlink.js > Player#setVolume >> Volume updated for guild ${this.guildId}`);

        return this;
    }

    /** Await backend acknowledgement. On failure the last confirmed volume is retained. */
    public async setVolumeAsync(volume: number): Promise<this> {
        validate(volume, v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000,
            "Player#setVolumeAsync > Volume must be between 0 and 1000.");
        const revision = ++this.volumeRevision;
        return this.commands.enqueue(async () => {
            if (this.destroyed) throw new Error("Cannot update volume on a destroyed player");
            await this.sendPlayerUpdate({ volume });
            if (this.optimisticVolumeRevision > revision) return this;
            const oldVolume = this.volume;
            this.volume = volume;
            await this.updateData("volume", volume);
            this.manager.emit("playerChangedVolume", this, oldVolume, volume);
            return this;
        });
    }

    public setLoop(loop: PlayerLoop, count?: number): this {
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

    public setAutoPlay(autoPlay: boolean): this {
        if (!autoPlay) playbackGuard(this).cancelAutoPlay();
        this.autoPlay = autoPlay;
        this.manager.emit("playerAutoPlaySet", this, autoPlay);
        this.updateData("autoPlay", this.autoPlay);
        this.manager.emit("debug", `Moonlink.js > Player#setAutoPlay >> AutoPlay set to ${autoPlay} for guild ${this.guildId}`);
        return this;
    }

    public setAutoLeave(autoLeave: boolean): this {
        this.autoLeave = autoLeave;
        this.manager.emit("playerAutoLeaveSet", this, autoLeave);
        this.updateData("autoLeave", this.autoLeave);
        this.manager.emit("debug", `Moonlink.js > Player#setAutoLeave >> AutoLeave set to ${autoLeave} for guild ${this.guildId}`);
        return this;
    }

    public shuffle(): this {
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

    public async destroy(reason?: string): Promise<void> {
        if (this.destructionPromise) return this.destructionPromise;
        if (this.destroyed) {
            return;
        }
        playbackGuard(this).invalidate();
        this.destroyed = true;
        this.node.cancelVoiceReconnect?.(this);
        const leased = this.manager.guildOwnership?.localLease(this.guildId);
        this.destructionPromise = this.commands.enqueue(() => this.destroyPlayback(reason))
            .finally(async () => {
                if (leased) await this.manager.guildOwnership?.release(this.guildId, leased);
            });
        // Leased voice cleanup must be authorized before any gateway send.
        if (!this.manager.guildOwnership) this.voice.destroy();
        this.stopHealthCheck();
        return this.destructionPromise;
    }

    private async destroyPlayback(reason?: string): Promise<void> {

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
        if (owner) try {
            await this.disconnect();
        } catch (e) {
            this.manager.emit("debug", `Moonlink.js > Player#destroy >> Voice disconnection failed for guild ${this.guildId}: ${(e as Error).message}`);
        }
        if (owner) try {
            await this.node.rest.destroyPlayer(this.guildId);
        } catch (e) {
            this.manager.emit("debug", `Moonlink.js > Player#destroy >> Failed to destroy player on node: ${(e as Error).message}`);
        }

        this.current = null;
        this.queue.clear();
        this.previous = [];
        if (owner) this.updateData("previous", []);

        if (this.manager.players.get(this.guildId) === this) {
            this.manager.players.players.delete(this.guildId);
        }
        // A stale process must not erase a successor's stored snapshot.
        if (owner && (!this.manager.guildOwnership ||
            await this.manager.guildOwnership.isCurrent(this.guildId))) {
            await this.manager.database.remove(`players.${this.guildId}`);
        }
        this.manager.emit('playerDestroyed', this, reason);

        this.manager.emit("debug", `Moonlink.js > Player#destroy >> Player destroyed for guild ${this.guildId}.`);
    }

    public async restart(options: RestartOptions = {}): Promise<boolean> {
        const guard = playbackGuard(this);
        const ticket = guard.ticket;
        const run = (operation: () => Promise<boolean>) => options[migrationRestart] ? operation() : this.commands.enqueue(operation);
        if (this.destroyed) return false;
        this.manager.emit("debug", `Moonlink.js > Player#restart -> Restarting player for guild ${this.guildId}`);
        this.manager.emit("playerResuming", this);
        if (this.destroyed || !guard.isCurrent(ticket)) return false;

        if (!this.voiceChannelId) {
            this.manager.emit("debug", `Moonlink.js > Player#restart >> Cannot restart player without a voiceChannelId for guild ${this.guildId}`);
            return false;
        }

        try {
            await this.connect();
        } catch (error) {
            this.manager.emit("debug", `Moonlink.js > Player#restart >> Voice connection failed for guild ${this.guildId}. Error: ${(error as Error).message}`);
            if (this.destroyed || !guard.isCurrent(ticket)) return false;
            if (options.destroyOnFailure !== false) await this.destroy("Failed to establish voice connection on restart.");
            return false;
        }

        if (this.destroyed || !guard.isCurrent(ticket)) return false;

        if (this.current) {
            const lastKnownPosition = this.get<number>("lastKnownPosition");
            const lastState = this.get<{ position: number; connected: boolean }>("lastState");

            const currentLavalinkPos = lastState?.position ?? 0;
            const isResumedSync = this.node.resumed && this.playing && currentLavalinkPos > 0;
            const isAlreadySync = !options[migrationRestart] && (isResumedSync || (lastState?.connected && Math.abs(currentLavalinkPos - (this.current.position ?? 0)) < 2000));

            if (isAlreadySync && this.playing) {
                this.manager.emit("debug", `Moonlink.js > Player#restart >> Player already in sync for guild ${this.guildId}, skipping track restoration. (Resumed: ${this.node.resumed}, Sync: ${isAlreadySync})`);
                this.manager.emit("playerResumed", this);
                return true;
            }

            // A migration must use the captured source position, not stale telemetry
            // belonging to an older track or a seek before the transfer.
            const observed = this.current.position ?? 0;
            const resumePosition = options[migrationRestart] ? observed : Math.max(
                Number.isFinite(lastKnownPosition) ? lastKnownPosition! : 0,
                Number.isFinite(currentLavalinkPos) ? currentLavalinkPos : 0,
                observed
            );

            this.manager.emit("debug", `Moonlink.js > Player#restart -> Restoring current track "${this.current.title}" for guild ${this.guildId} at ${resumePosition}ms. AlreadySync: ${isAlreadySync}`);

            const payload: any = {
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

            if (this.fading) payload.fading = this.fading;
            if (this.crossfade && this.node.isNodeLink) payload.crossfade = this.crossfade;
            if (this.queuePreload) {
                if (this.node.isNodeLink) payload.nextTrack = null;
            } else if (this.nextTrack) payload.nextTrack = this.nextTrack;
            if (this.loudnessNormalizer !== undefined) {
                payload.loudnessNormalizer = this.loudnessNormalizer;
            }

            const restored = await run(async () => {
                if (this.destroyed || !guard.isCurrent(ticket)) return false;
                if (!await this.restoreVoiceForRestart(ticket)) return false;
                await this.sendPlayerUpdate(payload);
                return !this.destroyed && guard.isCurrent(ticket);
            });
            if (!restored) return false;

        } else if (this.queue.size > 0 && options.startQueued !== false) {
            this.manager.emit("debug", `Moonlink.js > Player#restart -> No current track, playing first from queue for guild ${this.guildId}`);
            if (!await run(async () => {
                if (!await this.restoreVoiceForRestart(ticket)) return false;
                return this.playNext({}, ticket);
            }).catch(() => false)) return false;
        } else {
            if (options[migrationRestart]) {
                if (!await this.restoreVoiceForRestart(ticket)) return false;
                await this.sendPlayerUpdate({ filters: this.filters.toPayload(), volume: this.volume, paused: this.paused });
                if (this.destroyed || !guard.isCurrent(ticket)) return false;
            }
            this.manager.emit("debug", `Moonlink.js > Player#restart >> No track to restore and queue is empty for guild ${this.guildId}`);
            return true;
        }

        if (!options[migrationRestart]) this.manager.emit("playerResumed", this);
        return true;
    }

    private async restoreVoiceForRestart(ticket: number): Promise<boolean> {
        if (this.destroyed || !playbackGuard(this).isCurrent(ticket)) return false;
        const { sessionId, token, endpoint } = this.voice;
        if (!sessionId || !token || !endpoint) return false;
        await this.sendPlayerUpdate({ voice: { sessionId, token, endpoint, channelId: this.voiceChannelId } }, true);
        return !this.destroyed && playbackGuard(this).isCurrent(ticket);
    }

    public async transferNode(node: Node | string): Promise<boolean> {
        const targetNode = typeof node === "string" ? this.manager.nodes.nodes.get(node) : node;
        if (this.destroyed || !targetNode || targetNode.manager !== this.manager || !NodeSelector.matches(targetNode, this.nodeSelection) || targetNode.identifier === this.node.identifier) return false;

        this.node.cancelVoiceReconnect?.(this);
        const ticket = playbackGuard(this).invalidate();
        return this.commands.enqueue(() => migratePlayer(this, targetNode, ticket));
    }

    public setVoiceChannelId(voiceChannelId: string): this {
        validate(
            voiceChannelId,
            (v) => typeof v === "string" && v.length > 0,
            "Player#setVoiceChannelId > Voice channel ID must be a non-empty string."
        );

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

    public setTextChannelId(textChannelId: string): this {
        validate(
            textChannelId,
            (v) => typeof v === "string" && v.length > 0,
            "Player#setTextChannelId > Text channel ID must be a non-empty string."
        );

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

    public async replay(): Promise<boolean> {
        if (!this.current?.encoded || this.destroyed) return false;
        const guard = playbackGuard(this);
        const ticket = guard.invalidate();
        return this.commands.enqueue(async () => {
            if (this.destroyed || !guard.isCurrent(ticket)) return false;
            const original = this.current;
            if (!original?.encoded) return false;

            // Replaying must not modify the live Track's position before the
            // backend acknowledges the restart, or append a duplicate history
            // entry for the same song.
            const copy = new Track(original.toJSON(), original.requester, original.origin,
                this.manager.options.trackPartial ?? []);
            let injectedTrackQueued = false;
            try {
                return await this.playNext({ track: copy, position: 0 }, ticket, () => true,
                    queued => { injectedTrackQueued = queued; }, true);
            } finally {
                // On an unsuccessful attempt the normal play path may leave
                // its injected Track queued. Never turn replay into a future
                // unsolicited song request.
                if (injectedTrackQueued) {
                    const index = this.queue.tracks.indexOf(copy);
                    if (index >= 0) this.queue.remove(index);
                }
            }
        });
    }

    public async back(): Promise<boolean> {
        if (this.destroyed || this.previous.length === 0) return false;
        const guard = playbackGuard(this);
        const ticket = guard.invalidate();
        return this.commands.enqueue(async () => {
            if (this.destroyed || !guard.isCurrent(ticket)) return false;
            const lastTrack = this.previous.at(-1);
            if (!lastTrack) return false;
            const outgoing = this.current;
            const priorBackFlag = this.get<boolean>("isBackPlay") ?? false;
            let injectedTrackQueued = false;
            let played = false;

            // Do not consume history or change the current track before the
            // backend acknowledges playback. The command queue also prevents
            // two overlapping back() calls from corrupting the same history.
            this.set("isBackPlay", true);
            try {
                played = await this.playNext({ track: lastTrack, position: 0 }, ticket, () => true,
                    queued => { injectedTrackQueued = queued; });
                if (!played || !guard.isCurrent(ticket) || this.destroyed) return false;

                const index = this.previous.lastIndexOf(lastTrack);
                if (index >= 0) {
                    this.previous.splice(index, 1);
                    this.updateData("previous", this.previous.map(track => TrackCodec.serialize(track)));
                }
                if (outgoing) this.queue.unshift(outgoing);
                this.manager.emit("playerTriggeredBack", this, lastTrack);
                return true;
            } finally {
                // Failed playNext may have requeued its injected track. Remove
                // only that unconsumed insertion; keep the user's queue intact.
                if (injectedTrackQueued) {
                    const index = this.queue.tracks.indexOf(lastTrack);
                    if (index >= 0) this.queue.remove(index);
                }
                if (!played) this.set("isBackPlay", priorBackFlag);
            }
        });
    }

}
