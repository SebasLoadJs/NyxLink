import { requireGroupId, requireGuildId, groupCreateBody, groupPatchBody, validateGroup, validateGroups, validateGroupPatch, sponsorOptionsBody, sponsorSegmentsBody, validateSponsorState, type PlayerGroup, type GroupCreate, type GroupPatch, type GroupPatchResult, type SponsorBlockOptions, type SponsorBlockSegment, type SponsorBlockState } from '../backends/NodeLinkOrchestration';
import { lyricsParameters, validateSourceHealth, type LyricsRequestOptions, type SourceHealthResponse } from '../backends/NodeLinkContracts';
import { hasLavaLyricsPlugin, lavaLyricsParameters, validateLavaLyrics, type LavaLyricsData, type LavaLyricsOptions } from '../backends/LavaLyricsContracts';
import type http from "node:http";
import { validateLoadResponse, validateTrackResponse, validatePlayerRead, validatePlayerAcknowledgement, validateSessionResponse, ProtocolResponseError } from "../backends/ProtocolValidation";
import { HttpError } from "../errors/HttpError";
import type { BackendAdapter } from "../backends/BackendAdapter";
import { resolveExtensionRoute, type ExtensionOperation, type ExtensionRouteParameters } from "../backends/ExtensionRoutes";
import { preparePlayerUpdate, type PlayerUpdatePayload, type PlayerUpdateAcknowledgement, type SessionUpdateResponse } from "../backends/ProtocolContracts";
import { FeatureUnavailableError } from "../errors/FeatureUnavailableError";
import { makeRequest, makeStreamRequest, normalizeNodeLinkResponse, type NodeLinkResponse, type ResponseWithHeaders, nodeLinkOnlyError } from "../Util";
import type { IChapter, IFilters, ILyricsData, ILyricsResponse, IMeaningResponse, INodeConnectionStatus } from "../typings/Interfaces";
import { Node } from "./Node";
import type { Player } from "./Player";
import { IRESTLoadTracks, IRESTGetLyrics, IRESTGetPlayers, ITrack, INodeStats, IRoutePlannerStatus } from "../typings/Interfaces";
import { playbackGuard } from '../players/PlaybackGuard';

export class RestError extends Error {
    public statusCode: number;
    public isSessionExpired: boolean;
    
    constructor(message: string, statusCode: number) {
        super(message);
        this.name = 'RestError';
        this.statusCode = statusCode;
        this.isSessionExpired = statusCode === 404;
    }
}

export class Rest {
    private readonly node: Node;
    private readonly authHeaders: Record<string, string>;
    private readonly jsonHeaders: Record<string, string>;
    private readonly userAgentHeaders: Record<string, string>;
    private readonly sessionRecoveries = new WeakSet<Player>();

    constructor(node: Node) {
        this.node = node;
        this.authHeaders = {
            "Authorization": this.node.password,
            "User-Agent": this.node.manager.options?.userAgent ?? "NyxLink"
        };
        this.jsonHeaders = {
            ...this.authHeaders,
            "Content-Type": "application/json"
        };
        this.userAgentHeaders = {
            "User-Agent": this.node.manager.options?.userAgent ?? "NyxLink"
        };
    }

    public get url(): string {
        return `http${this.node.secure ? "s" : ""}://${this.node.host}:${this.node.port}`;
    }

    private async triggerPlayerRecovery(player: Player): Promise<void> {
        if (player.destroyed || this.node.destroyed || player.node !== this.node) return;

        player.stuckDetectionCount = 0;
        player.silentDetectionCount = 0;
        const guard = playbackGuard(player);
        let ticket = guard.ticket;
        const active = () => !player.destroyed && !this.node.destroyed &&
            player.node === this.node && this.node.manager.players.get(player.guildId) === player &&
            guard.isCurrent(ticket);
        try {
            const recovering = player.softRestart("Session expired (404)");
            ticket = guard.ticket;
            const recovered = await recovering;
            if (!active()) return;
            if (recovered) {
                this.node.manager.emit("playerRecoverySuccess", player);
            } else {
                await player.destroy("Session expired and recovery failed");
            }
        } catch (error) {
            if (!active()) return;
            this.node.manager.emit("debug", `NyxLink > Rest > Recovery error: ${(error as Error).message}`);
            if (active()) await player.destroy("Session recovery error");
        }
    }

    private extensionRoute(operation: ExtensionOperation, params: ExtensionRouteParameters = {}) {
        const parameters = { ...params, sessionId: this.node.sessionId };
        return this.node.backend ? this.node.backend.resolveExtension(operation, parameters)
            : resolveExtensionRoute(this.node.isNodeLink ? 'nodelink' : 'unknown', operation, parameters);
    }

    private async featureRequest<T = any>(operation: ExtensionOperation, params: ExtensionRouteParameters, options: http.RequestOptions & { body?: any }, validate?: (response: unknown) => void): Promise<T> {
        const route = this.extensionRoute(operation, params);
        const feature = route.feature;
        this.node.assertFeature(feature);
        if (route.transport !== 'json') throw new TypeError('Extension requires stream transport');
        const backend = this.node.backend;
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        const result = await this.node.circuit.run(async () => {
            try { return await makeRequest<T>(this.url + route.path, { ...options, method: route.method, throwOnError: true }, 10000, 0); }
            catch (error) { this.featureError(feature, error, backend, current); }
        });
        if (result === undefined) throw new Error('Backend did not acknowledge feature request');
        validate?.(result);
        if (current()) backend?.recordFeature(feature, 'available');
        return result;
    }

    private featureError(feature: string, error: unknown, backend: BackendAdapter | undefined, current: () => boolean): never {
        const body = error instanceof HttpError ? error.body : undefined;
        const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : '';
        const unavailable = error instanceof HttpError && (error.statusCode === 501 ||
            [403, 404].includes(error.statusCode) && /requested route was not found|unknown (?:route|endpoint)|(?:endpoint|feature).*disabled/i.test(message));
        if (unavailable) {
            if (current()) backend?.recordFeature(feature, 'unavailable');
            throw new FeatureUnavailableError(feature, backend?.kind ?? 'unknown', error.statusCode);
        }
        throw error;
    }

    /** Low-level session group API: does not synchronize NyxLink's local queues or player commands. */
    public async getGroups(): Promise<PlayerGroup[]> {
        return this.featureRequest<PlayerGroup[]>('groups:list', {}, { headers: this.authHeaders }, validateGroups);
    }
    public async getGroup(groupId: string): Promise<PlayerGroup> {
        requireGroupId(groupId);
        return this.featureRequest<PlayerGroup>('groups:get', { groupId }, { headers: this.authHeaders }, value => validateGroup(value, groupId));
    }
    public async createGroup(options: GroupCreate): Promise<PlayerGroup> {
        const body = groupCreateBody(options);
        return this.featureRequest<PlayerGroup>('groups:create', {}, { headers: this.jsonHeaders, body }, value => validateGroup(value, body.id));
    }
    /** Non-atomic across members. Inspect errors even when HTTP succeeds. */
    public async updateGroup(groupId: string, options: GroupPatch): Promise<GroupPatchResult> {
        requireGroupId(groupId);
        return this.featureRequest<GroupPatchResult>('groups:update', { groupId }, { headers: this.jsonHeaders, body: groupPatchBody(options) }, value => validateGroupPatch(value, groupId));
    }
    public async deleteGroup(groupId: string): Promise<void> {
        requireGroupId(groupId);
        await this.featureRequest('groups:delete', { groupId }, { headers: this.authHeaders });
    }
    public async getSponsorBlock(guildId: string): Promise<SponsorBlockState> {
        requireGuildId(guildId);
        return this.featureRequest<SponsorBlockState>('sponsorblock:get', { guildId }, { headers: this.authHeaders }, validateSponsorState);
    }
    public async updateSponsorBlock(guildId: string, options: SponsorBlockOptions): Promise<SponsorBlockState> {
        requireGuildId(guildId);
        return this.featureRequest<SponsorBlockState>('sponsorblock:update', { guildId }, { headers: this.jsonHeaders, body: sponsorOptionsBody(options) }, validateSponsorState);
    }
    public async setSponsorBlockSegments(guildId: string, segments: SponsorBlockSegment[]): Promise<SponsorBlockState> {
        requireGuildId(guildId);
        return this.featureRequest<SponsorBlockState>('sponsorblock:segments', { guildId }, { headers: this.jsonHeaders, body: sponsorSegmentsBody(segments) }, validateSponsorState);
    }
    public async clearSponsorBlock(guildId: string): Promise<void> {
        requireGuildId(guildId);
        await this.featureRequest('sponsorblock:clear', { guildId }, { headers: this.authHeaders });
    }

    public async getPlayers(): Promise<IRESTGetPlayers[] | null> {
        const res = await makeRequest<unknown>(`${this.url}/v4/sessions/${this.node.sessionId}/players`, {
            method: "GET",
            headers: this.authHeaders
        });
        if (res === undefined || res === null) return null;
        if (!Array.isArray(res)) throw new ProtocolResponseError('get players', 'player array');
        const players: IRESTGetPlayers[] = [];
        for (const row of res) {
            validatePlayerRead(row);
            players.push(row);
        }
        return players;
    }

    public async getPlayer(guildId: string): Promise<IRESTGetPlayers | null> {
        const res = await makeRequest<unknown>(`${this.url}/v4/sessions/${this.node.sessionId}/players/${guildId}`, {
            method: "GET",
            headers: this.authHeaders
        });
        if (res === undefined || res === null) return null;
        validatePlayerRead(res, guildId);
        return res;
    }

    public async updatePlayer(guildId: string, data: PlayerUpdatePayload, noReplace: boolean = false): Promise<PlayerUpdateAcknowledgement | null> {
        const payload = this.node.backend ? this.node.backend.preparePlayerUpdate(data) : preparePlayerUpdate(this.node.isNodeLink ? 'nodelink' : 'unknown', data);
        const params = new URLSearchParams();
        if (noReplace) {
            params.append("noReplace", "true");
        }
        const owner = this.node.manager.players.get(guildId);
        const intent = owner ? playbackGuard(owner).ticket : undefined;
        const session = this.node.sessionId;

        try {
            const res = await this.node.circuit.run(() => makeRequest<unknown>(`${this.url}/v4/sessions/${session}/players/${guildId}?${params.toString()}`, {
                method: "PATCH",
                headers: this.jsonHeaders,
                body: payload,
                throwOnError: true
            }, undefined, 0));
            if (res === undefined || res === null) return null;
            validatePlayerAcknowledgement(res, guildId);
            return res;
        } catch (error) {
            if (error instanceof HttpError && error.statusCode === 404 &&
                owner && !owner.destroyed && !this.node.destroyed && owner.node === this.node &&
                this.node.manager.players.get(guildId) === owner && this.node.sessionId === session &&
                playbackGuard(owner).isCurrent(intent!) && !this.sessionRecoveries.has(owner)) {
                this.sessionRecoveries.add(owner);
                void this.triggerPlayerRecovery(owner)
                    .catch(error => this.node.manager.emit("debug", `NyxLink > Rest > Recovery failed: ${(error as Error).message}`))
                    .finally(() => { this.sessionRecoveries.delete(owner); });
            }
            throw error;
        }
    }

    public async destroyPlayer(guildId: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<void> {
        const timeout = options?.timeoutMs ?? 10000;
        if (options && (!Number.isFinite(timeout) || timeout <= 0 || timeout > 60000)) throw new TypeError('Cleanup timeout must be within 1..60000 ms');
        try {
            await makeRequest(`${this.url}/v4/sessions/${this.node.sessionId}/players/${guildId}`, {
                method: "DELETE",
                headers: this.authHeaders,
                signal: options?.signal,
                throwOnError: options !== undefined
            }, options ? timeout : undefined, options ? 0 : undefined);
        } catch (error) {
            const err = error as Error;
            if (!err.message.includes('status 404')) {
                throw error;
            }
        }
    }

    public async loadTracks(identifier: string, options?: { timeoutMs: number; signal?: AbortSignal }): Promise<IRESTLoadTracks> {
        const params = new URLSearchParams();
        params.append("identifier", identifier);

        const protectedRequest = this.node.circuit.enabled;
        return this.node.circuit.run(async () => {
            const res = await makeRequest<unknown>(`${this.url}/v4/loadtracks?${params}`, {
                method: "GET",
                headers: this.authHeaders,
                throwOnError: protectedRequest || options !== undefined,
                signal: options?.signal
            }, options?.timeoutMs ?? 10000, protectedRequest || options ? 0 : 3);
            if (res === undefined || res === null) return { loadType: "empty", data: {} };
            validateLoadResponse(res);
            return res;
        });
    }

    public async decodeTrack(encodedTrack: string): Promise<ITrack | null> {
        const params = new URLSearchParams();
        params.append("encodedTrack", encodedTrack);

        const res = await makeRequest<unknown>(`${this.url}/v4/decodetrack?${params}`, {
            method: "GET",
            headers: this.authHeaders
        });
        if (res === undefined || res === null) return null;
        validateTrackResponse(res);
        return res;
    }

    public async decodeTracks(encodedTracks: string[]): Promise<ITrack[] | null> {
        const res = await makeRequest<unknown>(`${this.url}/v4/decodetracks`, {
            method: "POST",
            headers: this.jsonHeaders,
            body: encodedTracks
        });
        if (res === undefined || res === null) return null;
        if (!Array.isArray(res)) throw new ProtocolResponseError('decode tracks', 'track array');
        for (const track of res) validateTrackResponse(track, 'decode tracks');
        return res;
    }

    public async getInfo(): Promise<any | null> {
        const res = await makeRequest<any>(`${this.url}/v4/info`, {
            method: "GET",
            headers: this.authHeaders
        });
        return res || null;
    }

    public async getInfoWithHeaders(): Promise<ResponseWithHeaders<any> | null> {
        const res = await makeRequest<any>(`${this.url}/v4/info`, {
            method: "GET",
            headers: this.authHeaders,
            returnHeaders: true,
            throwOnError: true
        }, 10000, 0);
        return res || null;
    }

    public async getVersion(timeout?: number, retries?: number): Promise<string | null> {
        const res = await makeRequest<string>(`${this.url}/version`, {
            method: "GET",
            headers: this.authHeaders
        }, timeout, retries);
        return res || null;
    }

    public async getStats(): Promise<INodeStats | null> {
        const protectedRequest = this.node.circuit.enabled;
        const res = await this.node.circuit.run(async () => {
            const stats = await makeRequest<INodeStats>(`${this.url}/v4/stats`, {
                method: "GET", headers: this.authHeaders, throwOnError: protectedRequest
            }, protectedRequest ? 10000 : undefined, protectedRequest ? 0 : undefined);
            if (protectedRequest) {
                const measurements = [stats?.players, stats?.cpu?.systemLoad, stats?.memory?.used, stats?.memory?.allocated];
                if (!stats?.memory?.allocated || !measurements.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
                    throw new TypeError('Invalid node statistics');
                }
            }
            return stats;
        });
        return res || null;
    }

    public async getRoutePlannerStatus(): Promise<IRoutePlannerStatus | null> {
        const res = await makeRequest<IRoutePlannerStatus>(`${this.url}/v4/routeplanner/status`, {
            method: "GET",
            headers: this.authHeaders
        });
        return res || null;
    }

    public async freeFailedAddress(address: string): Promise<void> {
        await makeRequest(`${this.url}/v4/routeplanner/free/address`, {
            method: "POST",
            headers: this.jsonHeaders,
            body: { address }
        });
    }

    public async freeAllFailedAddresses(): Promise<void> {
        await makeRequest(`${this.url}/v4/routeplanner/free/all`, {
            method: "POST",
            headers: this.authHeaders
        });
    }

    public async updateSession(resuming: boolean, timeout: number): Promise<SessionUpdateResponse | null> {
        const res = await makeRequest<unknown>(`${this.url}/v4/sessions/${this.node.sessionId}`, {
            method: "PATCH",
            headers: this.jsonHeaders,
            body: {
                resuming,
                timeout
            }
        });
        if (res === undefined || res === null) return null;
        validateSessionResponse(res);
        return res;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async addMixLayer(
        guildId: string,
        data: { track: { encoded: string; userData?: Record<string, any> }; volume?: number }
    ): Promise<any | null> {
        this.node.assertFeature("mix:add");

        const res = await this.featureRequest<any>("mix:add", { guildId }, {
            headers: this.jsonHeaders,
            body: data
        });

        return res || null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async getMixLayers(guildId: string): Promise<any | null> {
        this.node.assertFeature("mix:list");

        const res = await this.featureRequest<any>("mix:list", { guildId }, {
            headers: this.authHeaders
        });

        return res || null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async updateMixLayerVolume(guildId: string, mixId: string, volume: number): Promise<void> {
        this.node.assertFeature("mix:update");

        await this.featureRequest("mix:update", { guildId, mixId }, {
            headers: this.jsonHeaders,
            body: { volume }
        });
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async removeMixLayer(guildId: string, mixId: string): Promise<void> {
        this.node.assertFeature("mix:remove");

        await this.featureRequest("mix:remove", { guildId, mixId }, {
            headers: this.authHeaders
        });
    }

    /**
     * Lavalink LavaLyrics plugin API: GET /v4/lyrics?track=...
     * Never treat a NodeLink or unrelated Lavalink plugin as this endpoint.
     * The 204 No Content response maps to null; this method does not subscribe
     * to live lyric events or guarantee that a provider has lyrics.
     */
    public async getLavaLyrics(encodedTrack: string, options?: LavaLyricsOptions): Promise<LavaLyricsData | null> {
        const params = lavaLyricsParameters(encodedTrack, options);
        const backend = this.node.backend;
        if (backend?.kind !== 'lavalink' || !hasLavaLyricsPlugin(backend.plugins) ||
            backend.featureStatus('lavalyrics') === 'unavailable') {
            throw new FeatureUnavailableError('lavalyrics', backend?.kind ?? 'unknown');
        }
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        const result = await this.node.circuit.run(async () => {
            try {
                return await makeRequest<unknown>(this.url + '/v4/lyrics?' + params.toString(), {
                    method: 'GET', headers: this.authHeaders, throwOnError: true
                }, 10000, 0);
            } catch (error) {
                this.featureError('lavalyrics', error, backend, current);
            }
        });
        // The shared HTTP transport represents a bodyless 204 as an empty
        // string. Never accept an empty JSON object as a valid 200 response.
        if (result === '') {
            if (current()) backend.recordFeature('lavalyrics', 'available');
            return null;
        }
        validateLavaLyrics(result);
        if (current()) backend.recordFeature('lavalyrics', 'available');
        return result;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    /** Source-specific lyrics or captions, preserving the legacy language string. */
    public async loadLyrics(encodedTrack: string, options?: string | LyricsRequestOptions): Promise<NodeLinkResponse<ILyricsData | Record<string, any>> | null> {
        this.node.assertFeature("lyrics");

        const params = lyricsParameters(encodedTrack, options);

        const res = await this.featureRequest<ILyricsResponse>("lyrics", { query: params }, {
            headers: this.authHeaders
        });

        return res ? normalizeNodeLinkResponse(res, res.loadType) : null;
    }

    /** Monitoring may be disabled even when the diagnostic endpoint is available. */
    public async getSourceHealth(): Promise<SourceHealthResponse> {
        return this.featureRequest<SourceHealthResponse>('source-health', {}, { headers: this.authHeaders }, validateSourceHealth);
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async loadChapters(encodedTrack: string): Promise<NodeLinkResponse<IChapter[]> | null> {
        this.node.assertFeature("chapters");

        const params = new URLSearchParams();
        params.append("encodedTrack", encodedTrack);

        const res = await this.featureRequest<IChapter[]>("chapters", { query: params }, {
            headers: this.authHeaders
        });

        return res ? normalizeNodeLinkResponse(res, "chapters") : null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async loadMeaning(encodedTrack: string, lang?: string): Promise<NodeLinkResponse<IMeaningResponse | Record<string, any>> | null> {
        this.node.assertFeature("meaning");

        const params = new URLSearchParams();
        params.append("encodedTrack", encodedTrack);
        if (lang) params.append("lang", lang);

        const res = await this.featureRequest<IMeaningResponse>("meaning", { query: params }, {
            headers: this.authHeaders
        });

        return res ? normalizeNodeLinkResponse(res, res.loadType) : null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async getConnectionStatus(): Promise<NodeLinkResponse<INodeConnectionStatus> | null> {
        this.node.assertFeature("connection");

        const res = await this.featureRequest<INodeConnectionStatus>("connection", {}, {
            headers: this.authHeaders
        });

        return res ? normalizeNodeLinkResponse(res, "connection") : null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async getMetrics(): Promise<string | null> {
        this.node.assertFeature("metrics");

        const res = await this.featureRequest<string>("metrics", {}, {
            headers: this.authHeaders
        });

        return res || null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async getWorkers(): Promise<NodeLinkResponse<any[]> | null> {
        this.node.assertFeature("workers:get");

        const res = await this.featureRequest<any[]>("workers:get", {}, {
            headers: this.authHeaders
        });

        return res ? normalizeNodeLinkResponse(res, "workers") : null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async patchWorker(payload: Record<string, any>): Promise<any | null> {
        this.node.assertFeature("workers:patch");

        const res = await this.featureRequest<any>("workers:patch", {}, {
            headers: this.jsonHeaders,
            body: payload
        });

        return res || null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async getYoutubeConfig(validate: boolean = false): Promise<any | null> {
        this.node.assertFeature("youtube:config");

        const params = new URLSearchParams();
        if (validate) params.append("validate", "true");
        const res = await this.featureRequest<any>("youtube:config:get", { query: params }, {
            headers: this.authHeaders
        });

        return res || null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async updateYoutubeConfig(payload: { refreshToken?: string; visitorData?: string }): Promise<any | null> {
        this.node.assertFeature("youtube:config");

        const res = await this.featureRequest<any>("youtube:config:update", {}, {
            headers: this.jsonHeaders,
            body: payload
        });

        return res || null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async exchangeYoutubeOAuth(refreshToken: string): Promise<any | null> {
        this.node.assertFeature("youtube:oauth");

        const params = new URLSearchParams();
        params.append("refreshToken", refreshToken);
        const res = await this.featureRequest<any>("youtube:oauth", { query: params }, {
            headers: this.authHeaders
        });

        return res || null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async encodeTrackRemote(track: string): Promise<string | null> {
        this.node.assertFeature("encodetrack");

        const params = new URLSearchParams();
        params.append("track", track);
        const res = await this.featureRequest<string>("encodetrack", { query: params }, {
            headers: this.authHeaders
        });

        return res || null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async encodeTracksRemote(tracks: Array<{ encoded: string; info: Record<string, any> }>): Promise<string[] | null> {
        this.node.assertFeature("encodedtracks");

        const res = await this.featureRequest<string[]>("encodedtracks", {}, {
            headers: this.jsonHeaders,
            body: tracks
        });

        return res || null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async trackStream(encodedTrack: string, itag?: number | null): Promise<any | null> {
        this.node.assertFeature("trackstream");

        const params = new URLSearchParams();
        params.append("encodedTrack", encodedTrack);
        if (itag !== undefined && itag !== null) {
            params.append("itag", String(itag));
        }

        const res = await this.featureRequest<any>("trackstream", { query: params }, {
            headers: this.authHeaders
        });

        return res || null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async loadStream(payload: { encodedTrack: string; volume?: number; position?: number; format?: 'pcm' | 'wav'; filters?: IFilters | Record<string, any> }, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<{ stream: NodeJS.ReadableStream; headers: Record<string, any> }> {
        this.node.assertFeature('loadstream');
        const route = this.extensionRoute('loadstream');
        const backend = this.node.backend;
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        try {
            const res = await makeStreamRequest(this.url + route.path, {
                method: route.method, headers: this.jsonHeaders, body: payload, signal: options.signal,
            }, options.timeoutMs ?? 100000);
            if (current()) backend?.recordFeature('loadstream', 'available');
            return { stream: res.stream, headers: res.headers };
        } catch (error) { this.featureError('loadstream', error, backend, current); }
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async subscribeLyrics(guildId: string, skipTrackSource?: boolean): Promise<void> {
        this.node.assertFeature("lyrics:subscribe");

        const params = new URLSearchParams();
        if (skipTrackSource) params.append("skipTrackSource", "true");
        await this.featureRequest("lyrics:subscribe", { guildId, query: params }, {
            headers: this.authHeaders
        });
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async unsubscribeLyrics(guildId: string): Promise<void> {
        this.node.assertFeature("lyrics:unsubscribe");

        await this.featureRequest("lyrics:unsubscribe", { guildId }, {
            headers: this.authHeaders
        });
    }
}
