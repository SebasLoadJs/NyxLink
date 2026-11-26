import type { BackendPluginRoute, BackendPluginRequest } from '../backends/BackendPluginRoutes';
import { mediaLookupQuery, validateMediaLookup, type NodeLinkMediaLookup, type NodeLinkMediaLookupResult } from '../backends/NodeLinkMediaLookup';
import { sessionPath, playerPath } from '../backends/SessionPath';
import { nodeLinkDiscoveryIdentifier, type NodeLinkDiscoveryOptions } from '../backends/NodeLinkSearchContracts';
import { hasLavaSearchPlugin, lavaSearchParameters, validateLavaSearch, type LavaSearchOptions, type LavaSearchResult } from '../backends/LavaSearchContracts';
import { observeOperation } from '../observability/OpenTelemetry';
import { getManagerLogRoute } from '../logging/ManagerLogRoute';
import { requireGroupId, requireGuildId, groupCreateBody, groupPatchBody, validateGroup, validateGroups, validateGroupPatch, sponsorOptionsBody, sponsorSegmentsBody, validateSponsorState, type PlayerGroup, type GroupCreate, type GroupPatch, type GroupPatchResult, type SponsorBlockOptions, type SponsorBlockSegment, type SponsorBlockState } from '../backends/NodeLinkOrchestration';
import { lyricsParameters, validateSourceHealth, validateNodeLinkStreamFormats, type LyricsRequestOptions, type SourceHealthResponse, type NodeLinkStreamFormats } from '../backends/NodeLinkContracts';
import { hasLavaLyricsPlugin, lavaLyricsParameters, lavaLyricsPlayerParameters, validateLavaLyrics, type LavaLyricsData, type LavaLyricsOptions } from '../backends/LavaLyricsContracts';
import { hasLavalinkSponsorBlockPlugin, lavalinkSponsorBlockPath, sponsorBlockCategoryBody, validateSponsorBlockCategories, type LavalinkSponsorBlockCategory } from '../backends/LavalinkSponsorBlockContracts';
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
import { validateNodeLinkStreamResponse } from '../backends/NodeLinkStreamResponse';
import { assertClientPcmSeekPosition, createClientPcmSeekStream } from '../backends/ClientPCMSeek';
import { mixCreateBody, requireMixId, requireMixVolume, validateMixCreated, validateMixLayers, type MixLayerCreated, type MixLayersResponse } from '../backends/NodeLinkMixContracts';

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
    private readonly request: typeof makeRequest;
    private readonly streamRequest: typeof makeStreamRequest;

    constructor(node: Node) {
        this.node = node;
        this.request = this.observeTransport(makeRequest, 'REST.http');
        this.streamRequest = this.observeTransport(makeStreamRequest, 'REST.stream.open');
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

    /** Preserve the transport's overloads/arguments while observing only safe metadata. */
    private observeTransport<F extends Function>(transport: F, operation: string): F {
        return new Proxy(transport, { apply: (target, receiver, args) => {
            const monitor = this.node.manager.performanceMonitor;
            const execute = () => monitor ? monitor.measure(operation === 'REST.http' ? 'rest' : 'streamOpen', () => Reflect.apply(target, receiver, args)) : Reflect.apply(target, receiver, args);
            const run = () => observeOperation(this.node.manager, 'nyxlink.rest', async () => {
                const aurora = getManagerLogRoute(this.node.manager);
                return aurora ? aurora.observe(operation === 'REST.http' ? 'rest' : 'stream', async () => execute(), { backend: this.node.backend?.kind }, result => {
                    if (operation === 'REST.http' && typeof result === 'object' && result !== null && (result as { loadType?: unknown }).loadType === 'error') {
                        try { if (new URL(args[0]).pathname === '/v4/loadtracks') return 'failed'; } catch {}
                    }
                    return 'completed';
                }) : execute();
            }, result => {
                if (result == null) return 'empty';
                // Classify the load response only for the actual loadtracks endpoint.
                let pathname = '';
                try { pathname = new URL(args[0]).pathname; } catch {}
                if (pathname === '/v4/loadtracks' && typeof result === 'object') {
                    const type = (result as { loadType?: unknown }).loadType;
                    if (type === 'error' || type === 'empty') return type;
                }
                return 'resolved';
            });
            return run();
        } });
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
        return this.runFeatureRequest<T>(operation, params, options, validate);
    }

    private async runFeatureRequest<T>(operation: ExtensionOperation, params: ExtensionRouteParameters, options: http.RequestOptions & { body?: any }, validate?: (response: unknown) => void): Promise<T> {
        const route = this.extensionRoute(operation, params);
        // NodeLink extension commands must obey the same guild lease as
        // ordinary playback PATCH/DELETE, including mix and subscription APIs.
        if (params.guildId && route.method !== 'GET') {
            await this.node.manager.guildOwnership?.assertCurrent(params.guildId);
        }
        const feature = route.feature;
        this.node.assertFeature(feature);
        if (route.transport !== 'json') throw new TypeError('Extension requires stream transport');
        const backend = this.node.backend;
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        const result = await this.node.circuit.run(async () => {
            try { return await this.request<T>(this.url + route.path, { ...options, method: route.method, throwOnError: true }, 10000, 0); }
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

    /** Invoke an explicitly registered, advertised plugin endpoint on this node. */
    public async callPlugin<T>(route: BackendPluginRoute<T>, options: BackendPluginRequest = {}): Promise<T> {
        const manager = this.node.manager;
        const registry = manager.pluginRoutes;
        if (!registry.owns(route)) throw new TypeError('Unregistered backend plugin route');
        const backend = this.node.backend;
        const session = this.node.sessionId;
        const socket = this.node.socket;
        const feature = 'custom-plugin:' + route.plugin + ':' + route.id;
        if (manager.destroyed || this.node.destroyed || backend?.kind !== route.backend || !backend.getPlugin(route.plugin) ||
            backend.featureStatus(feature) === 'unavailable') throw new FeatureUnavailableError(feature, backend?.kind ?? 'unknown');
        const current = () => !manager.destroyed && !this.node.destroyed && registry.owns(route) &&
            this.node.backend === backend && this.node.sessionId === session && this.node.socket === socket;
        const path = route.scope === 'player' ? playerPath(session, options.guildId) + '/' + route.path : '/v4/' + route.path;
        if (route.scope === 'node' && options.guildId !== undefined) throw new TypeError('Node-scoped plugin route does not accept a guild ID');
        const timeout = options.timeoutMs ?? 10000;
        if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw new TypeError('Invalid plugin request timeout');
        if (options.query !== undefined && !(options.query instanceof URLSearchParams)) throw new TypeError('Invalid plugin query');
        const query = options.query?.toString() ?? '';
        if (query.length > 16384) throw new TypeError('Plugin query too large');
        let body: string | undefined;
        if (options.body !== undefined) {
            if (route.method === 'GET' || !options.body || typeof options.body !== 'object' || Array.isArray(options.body)) throw new TypeError('Invalid plugin request body');
            body = JSON.stringify(options.body);
            if (typeof body !== 'string' || Buffer.byteLength(body) > 262144) throw new TypeError('Plugin request body too large');
        }
        options.signal?.throwIfAborted();
        if (route.scope === 'player' && route.method !== 'GET') await manager.guildOwnership?.assertCurrent(options.guildId!);
        if (!current()) throw new Error('Plugin request context changed');
        let response: unknown;
        try {
            response = await this.request<unknown>(this.url + path + (query ? '?' + query : ''), {
                method: route.method, headers: body === undefined ? this.authHeaders : this.jsonHeaders,
                ...(body === undefined ? {} : { body }), signal: options.signal,
                allowedOrigins: [new URL(this.url).origin], throwOnError: true, noContentAsNull: true,
            }, timeout, 0, 1000, 0);
        } catch (error) {
            this.featureError(feature, error, backend, current);
        }
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('Plugin request context changed');
        if (response === undefined) throw new ProtocolResponseError('backend plugin', 'response');
        const decoded = route.decode(response);
        if (!current()) throw new Error('Plugin request context changed');
        backend.recordFeature(feature, 'available');
        return decoded;
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
    /**
     * Lavalink SponsorBlock plugin: GET/PUT/DELETE .../sponsorblock/categories.
     * Separate from NodeLink's per-player SponsorBlock state/segment API.
     */
    private async lavalinkSponsorBlockRequest(
        method: 'GET' | 'PUT' | 'DELETE',
        guildId: string,
        categories?: LavalinkSponsorBlockCategory[]
    ): Promise<LavalinkSponsorBlockCategory[] | void> {
        if (method !== 'GET') await this.node.manager.guildOwnership?.assertCurrent(guildId);
        const path = lavalinkSponsorBlockPath(this.node.sessionId, guildId);
        const body = method === 'PUT' ? sponsorBlockCategoryBody(categories!) : undefined;
        const backend = this.node.backend;
        if (backend?.kind !== 'lavalink' || !hasLavalinkSponsorBlockPlugin(backend.plugins) ||
            backend.featureStatus('lavalink:sponsorblock') === 'unavailable') {
            throw new FeatureUnavailableError('lavalink:sponsorblock', backend?.kind ?? 'unknown');
        }
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        const result = await this.node.circuit.run(async () => {
            try {
                return await this.request<unknown>(this.url + path, {
                    method, headers: method === 'PUT' ? this.jsonHeaders : this.authHeaders,
                    ...(method === 'PUT' ? { body } : {}), throwOnError: true
                }, 10000, 0);
            } catch (error) {
                this.featureError('lavalink:sponsorblock', error, backend, current);
            }
        });
        if (method === 'GET') validateSponsorBlockCategories(result);
        if (result === undefined) throw new ProtocolResponseError('Lavalink SponsorBlock', 'response');
        if (current()) backend.recordFeature('lavalink:sponsorblock', 'available');
        return method === 'GET' ? [...(result as LavalinkSponsorBlockCategory[])] : undefined;
    }

    public getLavalinkSponsorBlockCategories(guildId: string): Promise<LavalinkSponsorBlockCategory[]> {
        return this.lavalinkSponsorBlockRequest('GET', guildId) as Promise<LavalinkSponsorBlockCategory[]>;
    }
    public async setLavalinkSponsorBlockCategories(guildId: string, categories: LavalinkSponsorBlockCategory[]): Promise<void> {
        await this.lavalinkSponsorBlockRequest('PUT', guildId, categories);
    }
    public async clearLavalinkSponsorBlockCategories(guildId: string): Promise<void> {
        await this.lavalinkSponsorBlockRequest('DELETE', guildId);
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
        const res = await this.request<unknown>(`${this.url}${sessionPath(this.node.sessionId)}/players`, {
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
        const res = await this.request<unknown>(`${this.url}${playerPath(this.node.sessionId, guildId)}`, {
            method: "GET",
            headers: this.authHeaders
        });
        if (res === undefined || res === null) return null;
        validatePlayerRead(res, guildId);
        return res;
    }

    public async updatePlayer(guildId: string, data: PlayerUpdatePayload, noReplace: boolean = false): Promise<PlayerUpdateAcknowledgement | null> {
        return this.updatePlayerRequest(guildId, data, noReplace);
    }

    private async updatePlayerRequest(guildId: string, data: PlayerUpdatePayload, noReplace: boolean): Promise<PlayerUpdateAcknowledgement | null> {
        requireGuildId(guildId);
        const requestSession = this.node.sessionId;
        const requestBackend = this.node.backend;
        const requestSocket = this.node.socket;
        playerPath(requestSession, guildId);
        await this.node.manager.guildOwnership?.assertCurrent(guildId);
        if (this.node.destroyed || this.node.sessionId !== requestSession ||
            this.node.backend !== requestBackend || this.node.socket !== requestSocket) throw new Error('Player update session changed');
        const payload = this.node.backend ? this.node.backend.preparePlayerUpdate(data) : preparePlayerUpdate(this.node.isNodeLink ? 'nodelink' : 'unknown', data);
        const params = new URLSearchParams();
        if (noReplace) {
            params.append("noReplace", "true");
        }
        const owner = this.node.manager.players.get(guildId);
        const intent = owner ? playbackGuard(owner).ticket : undefined;
        const session = this.node.sessionId;

        try {
            const res = await this.node.circuit.run(() => this.request<unknown>(`${this.url}${playerPath(session, guildId)}?${params.toString()}`, {
                method: "PATCH",
                headers: this.jsonHeaders,
                body: payload,
                throwOnError: true
            }, undefined, 0));
            if (this.node.destroyed || this.node.sessionId !== requestSession ||
                this.node.backend !== requestBackend || this.node.socket !== requestSocket) throw new Error('Player update session changed');
            if (res === undefined || res === null) return null;
            validatePlayerAcknowledgement(res, guildId);
            return res;
        } catch (error) {
            if (error instanceof HttpError && error.statusCode === 404 &&
                owner && !owner.destroyed && !this.node.destroyed && owner.node === this.node &&
                this.node.manager.players.get(guildId) === owner && this.node.sessionId === session &&
                this.node.backend === requestBackend && this.node.socket === requestSocket &&
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
        requireGuildId(guildId);
        const session = this.node.sessionId, backend = this.node.backend, socket = this.node.socket;
        const path = playerPath(session, guildId);
        await this.node.manager.guildOwnership?.assertCurrent(guildId);
        if (this.node.sessionId !== session || this.node.backend !== backend || this.node.socket !== socket) throw new Error('Player cleanup session changed');
        const timeout = options?.timeoutMs ?? 10000;
        if (options && (!Number.isFinite(timeout) || timeout <= 0 || timeout > 60000)) throw new TypeError('Cleanup timeout must be within 1..60000 ms');
        try {
            await this.request(`${this.url}${path}`, {
                method: "DELETE",
                headers: this.authHeaders,
                signal: options?.signal,
                throwOnError: options !== undefined
            }, options ? timeout : undefined, options ? 0 : undefined);
        } catch (error) {
            if (!(error instanceof HttpError) || error.statusCode !== 404) throw error;
        }
    }

    /** Native NodeLink discovery. Returned entities are not guaranteed playable. */
    public async loadNodeLinkSearch(query: string, options: NodeLinkDiscoveryOptions = {}): Promise<IRESTLoadTracks> {
        const identifier = nodeLinkDiscoveryIdentifier(query, options);
        const backend = this.node.backend;
        if (backend?.kind !== 'nodelink') throw new FeatureUnavailableError('nodelink:discovery', backend?.kind ?? 'unknown');
        const session = this.node.sessionId;
        const socket = this.node.socket;
        options.signal?.throwIfAborted();
        const result = await this.loadTracks(identifier, { timeoutMs: options.timeoutMs ?? 10000, signal: options.signal });
        options.signal?.throwIfAborted();
        if (this.node.destroyed || this.node.backend !== backend || this.node.sessionId !== session || this.node.socket !== socket) {
            throw new Error('NodeLink discovery session changed');
        }
        return result;
    }

    public async loadTracks(identifier: string, options?: { timeoutMs: number; signal?: AbortSignal }): Promise<IRESTLoadTracks> {
        const params = new URLSearchParams();
        params.append("identifier", identifier);

        const protectedRequest = this.node.circuit.enabled;
        return this.node.circuit.run(async () => {
            const res = await this.request<unknown>(`${this.url}/v4/loadtracks?${params}`, {
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

        const res = await this.request<unknown>(`${this.url}/v4/decodetrack?${params}`, {
            method: "GET",
            headers: this.authHeaders
        });
        if (res === undefined || res === null) return null;
        validateTrackResponse(res);
        return res;
    }

    public async decodeTracks(encodedTracks: string[]): Promise<ITrack[] | null> {
        const res = await this.request<unknown>(`${this.url}/v4/decodetracks`, {
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
        const res = await this.request<any>(`${this.url}/v4/info`, {
            method: "GET",
            headers: this.authHeaders
        });
        return res || null;
    }

    public async getInfoWithHeaders(): Promise<ResponseWithHeaders<any> | null> {
        const res = await this.request<any>(`${this.url}/v4/info`, {
            method: "GET",
            headers: this.authHeaders,
            returnHeaders: true,
            throwOnError: true
        }, 10000, 0);
        return res || null;
    }

    public async getVersion(timeout?: number, retries?: number): Promise<string | null> {
        const res = await this.request<string>(`${this.url}/version`, {
            method: "GET",
            headers: this.authHeaders
        }, timeout, retries);
        return res || null;
    }

    public async getStats(): Promise<INodeStats | null> {
        const protectedRequest = this.node.circuit.enabled;
        const res = await this.node.circuit.run(async () => {
            const stats = await this.request<INodeStats>(`${this.url}/v4/stats`, {
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
        const res = await this.request<IRoutePlannerStatus>(`${this.url}/v4/routeplanner/status`, {
            method: "GET",
            headers: this.authHeaders
        });
        return res || null;
    }

    public async freeFailedAddress(address: string): Promise<void> {
        await this.request(`${this.url}/v4/routeplanner/free/address`, {
            method: "POST",
            headers: this.jsonHeaders,
            body: { address }
        });
    }

    public async freeAllFailedAddresses(): Promise<void> {
        await this.request(`${this.url}/v4/routeplanner/free/all`, {
            method: "POST",
            headers: this.authHeaders
        });
    }

    public async updateSession(resuming: boolean, timeout: number): Promise<SessionUpdateResponse | null> {
        const res = await this.request<unknown>(`${this.url}${sessionPath(this.node.sessionId)}`, {
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
    ): Promise<MixLayerCreated | null> {
        this.node.assertFeature("mix:add");
        requireGuildId(guildId);
        const body = mixCreateBody(data);
        const res = await this.featureRequest<unknown>("mix:add", { guildId }, {
            headers: this.jsonHeaders,
            body
        }, validateMixCreated);
        return res == null ? null : res as MixLayerCreated;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async getMixLayers(guildId: string): Promise<MixLayersResponse | null> {
        this.node.assertFeature("mix:list");
        requireGuildId(guildId);
        const res = await this.featureRequest<unknown>("mix:list", { guildId }, {
            headers: this.authHeaders
        }, validateMixLayers);
        return res == null ? null : res as MixLayersResponse;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async updateMixLayerVolume(guildId: string, mixId: string, volume: number): Promise<void> {
        this.node.assertFeature("mix:update");
        requireGuildId(guildId);
        requireMixId(mixId);
        requireMixVolume(volume);

        await this.featureRequest("mix:update", { guildId, mixId }, {
            headers: this.jsonHeaders,
            body: { volume }
        });
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public async removeMixLayer(guildId: string, mixId: string): Promise<void> {
        this.node.assertFeature("mix:remove");
        requireGuildId(guildId);
        requireMixId(mixId);

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
    /** Advanced Lavalink search; distinct from NodeLink's source modifiers. */
    public async loadSearch(query: string, options: LavaSearchOptions = {}): Promise<LavaSearchResult | null> {
        const params = lavaSearchParameters(query, options);
        const backend = this.node.backend;
        if (backend?.kind !== 'lavalink' || !hasLavaSearchPlugin(backend.plugins) ||
            backend.featureStatus('lavasearch') === 'unavailable') {
            throw new FeatureUnavailableError('lavasearch', backend?.kind ?? 'unknown');
        }
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        options.signal?.throwIfAborted();
        const result = await this.node.circuit.run(async () => {
            try {
                return await this.request<unknown>(this.url + '/v4/loadsearch?' + params.toString(), {
                    method: 'GET', headers: this.authHeaders, throwOnError: true,
                    noContentAsNull: true, signal: options.signal
                }, options.timeoutMs ?? 10000, 0);
            } catch (error) {
                this.featureError('lavasearch', error, backend, current);
            }
        });
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('LavaSearch backend session changed');
        if (result !== null) validateLavaSearch(result);
        backend.recordFeature('lavasearch', 'available');
        return result;
    }

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
                return await this.request<unknown>(this.url + '/v4/lyrics?' + params.toString(), {
                    method: 'GET', headers: this.authHeaders, throwOnError: true,
                    noContentAsNull: true
                }, 10000, 0);
            } catch (error) {
                this.featureError('lavalyrics', error, backend, current);
            }
        });
        // HTTP 204 is null even if the server labels the empty body JSON.
        // Malformed 200 responses (including {}) still fail validation.
        if (result === null) {
            if (current()) backend.recordFeature('lavalyrics', 'available');
            return null;
        }
        validateLavaLyrics(result);
        if (current()) backend.recordFeature('lavalyrics', 'available');
        return result;
    }

    private async lavaLyricsPlayerRequest(method: 'GET' | 'POST' | 'DELETE', guildId: string, options?: LavaLyricsOptions): Promise<LavaLyricsData | null> {
        const backend = this.node.backend;
        const feature = method === 'GET' ? 'lavalyrics:current' : method === 'POST' ? 'lavalyrics:subscribe' : 'lavalyrics:unsubscribe';
        if (backend?.kind !== 'lavalink' || !hasLavaLyricsPlugin(backend.plugins) ||
            backend.featureStatus(feature) === 'unavailable') throw new FeatureUnavailableError(feature, backend?.kind ?? 'unknown');
        const session = this.node.sessionId, socket = this.node.socket;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.sessionId === session && this.node.socket === socket;
        const path = playerPath(session, guildId) + (method === 'GET' ? '/track/lyrics' : '/lyrics/subscribe');
        const query = lavaLyricsPlayerParameters(options).toString();
        if (method !== 'GET') await this.node.manager.guildOwnership?.assertCurrent(guildId);
        if (!current()) throw new Error('LavaLyrics player session changed');
        let result: unknown;
        try {
            result = await this.request<unknown>(this.url + path + (query ? '?' + query : ''), {
                method, headers: this.authHeaders, throwOnError: true, noContentAsNull: true,
                allowedOrigins: [new URL(this.url).origin],
            }, 10000, 0, 1000, 0);
        } catch (error) { this.featureError(feature, error, backend, current); }
        if (!current()) throw new Error('LavaLyrics player session changed');
        if (method !== 'GET') {
            if (result !== null) throw new ProtocolResponseError('LavaLyrics', 'subscription acknowledgement');
            backend.recordFeature(feature, 'available');
            return null;
        }
        if (result !== null) validateLavaLyrics(result);
        backend.recordFeature(feature, 'available');
        return result;
    }

    public getCurrentLavaLyrics(guildId: string, options?: LavaLyricsOptions): Promise<LavaLyricsData | null> {
        return this.lavaLyricsPlayerRequest('GET', guildId, options);
    }

    public async subscribeLavaLyrics(guildId: string, options?: LavaLyricsOptions): Promise<void> {
        await this.lavaLyricsPlayerRequest('POST', guildId, options);
    }

    public async unsubscribeLavaLyrics(guildId: string): Promise<void> {
        await this.lavaLyricsPlayerRequest('DELETE', guildId);
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    /** Optional external metadata lookup; provider outages are not node outages. */
    public async loadMedia(lookup: NodeLinkMediaLookup): Promise<NodeLinkMediaLookupResult> {
        const { key, id, query } = mediaLookupQuery(lookup);
        const route = this.extensionRoute('loadmedia', { query });
        this.node.assertFeature(route.feature);
        const backend = this.node.backend, socket = this.node.socket, session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend && this.node.socket === socket && this.node.sessionId === session;
        try {
            // Explicit requests only; no retry or circuit penalty for optional external providers.
            const raw = await this.request<unknown>(this.url + route.path, { method: 'GET', headers: this.authHeaders, throwOnError: true }, 10000, 0);
            if (!current()) throw new Error('Media lookup session changed');
            const result = validateMediaLookup(raw, key, id);
            backend?.recordFeature(route.feature, 'available');
            return result;
        } catch (error) { this.featureError(route.feature, error, backend, current); }
    }

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

    /**
     * Lavalink Prometheus endpoint (default /metrics). This is an optional
     * operational endpoint, distinct from NodeLink's /v4/metrics.
     * The node operator must enable Prometheus in Lavalink.
     */
    public async getLavalinkMetrics(names: readonly string[] = []): Promise<string | null> {
        if (this.node.backend?.kind !== 'lavalink') {
            throw new FeatureUnavailableError('lavalink:metrics', this.node.backend?.kind ?? 'unknown');
        }
        if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || !/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name))) {
            throw new TypeError('Invalid Prometheus metric name');
        }
        const params = new URLSearchParams();
        for (const name of names) params.append('name[]', name);
        const query = params.toString();
        const response = await this.request<unknown>(this.url + '/metrics' + (query ? '?' + query : ''), {
            method: 'GET', headers: { ...this.authHeaders, Accept: 'text/plain' }, throwOnError: true
        }, 10000, 0);
        if (response == null) return null;
        if (typeof response !== 'string') throw new TypeError('Invalid Prometheus metrics response');
        return response;
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

    /**
     * Newer NodeLink (2026-11-22+) lists the available original audio/video
     * representations via POST /v4/loadstream, format:'formats'. This is
     * JSON metadata, NEVER a PCM/audio stream. Older servers may return 400.
     */
    public async getStreamFormats(encodedTrack: string, options: { itag?: number; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<NodeLinkStreamFormats> {
        this.node.assertFeature('loadstream');
        if (typeof encodedTrack !== 'string' || !encodedTrack.trim()) throw new TypeError('Stream formats require an encoded track');
        if (options.itag !== undefined && (!Number.isSafeInteger(options.itag) || options.itag <= 0)) throw new TypeError('itag must be a positive integer');
        if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30000)) throw new RangeError('Invalid stream formats timeout');
        const route = this.extensionRoute('loadstream');
        const backend = this.node.backend;
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        try {
            const response = await this.request<unknown>(this.url + route.path, {
                method: route.method, headers: this.jsonHeaders,
                body: { encodedTrack, format: 'formats', ...(options.itag !== undefined ? { itag: options.itag } : {}) },
                signal: options.signal, throwOnError: true,
            }, options.timeoutMs ?? 10000, 0);
            validateNodeLinkStreamFormats(response);
            if (current()) backend?.recordFeature('loadstream', 'available');
            return response;
        } catch (error) { this.featureError('loadstream', error, backend, current); }
    }

    /**
     * NodeLink-only decoded audio API. The native server-side position path
     * remains the default. Opt-in seekMode:'pcm-trim' fetches position=0 raw
     * PCM and discards the first N ms locally; it is not a decoder/source seek.
     * This mode supports raw/pcm only and is capped at 30 seconds to bound
     * wasted decoding and bandwidth. Errors are never retried or suppressed.
     */
    public async loadStream(payload: { encodedTrack: string; volume?: number; position?: number; format?: 'raw' | 'pcm' | 'wav' | 'passthrough' | 'original' | 'source'; itag?: number; filters?: IFilters | Record<string, any> }, options: { signal?: AbortSignal; timeoutMs?: number; seekMode?: 'server' | 'pcm-trim'; range?: string } = {}): Promise<{ stream: NodeJS.ReadableStream; headers: Record<string, any>; statusCode: number }> {
        this.node.assertFeature('loadstream');
        // Only raw/wav represent decoded PCM. Newer NodeLink also supports
        // original compressed bytes through passthrough. Keep 'pcm' as alias.
        if (!payload || typeof payload !== 'object' || typeof payload.encodedTrack !== 'string' || !payload.encodedTrack.trim()) {
            throw new TypeError('LoadStream requires an encoded track');
        }
        if (payload.format !== undefined && !['raw', 'pcm', 'wav', 'passthrough', 'original', 'source'].includes(payload.format)) {
            throw new TypeError('LoadStream format must be raw, wav or passthrough (formats JSON uses getStreamFormats)');
        }
        const passthrough = ['passthrough', 'original', 'source'].includes(payload.format ?? '');
        if (payload.itag !== undefined && (!passthrough || !Number.isSafeInteger(payload.itag) || payload.itag <= 0)) {
            throw new TypeError('itag is only valid for passthrough and must be positive');
        }
        if (options.range !== undefined && (!passthrough ||
            !/^bytes=(?:\d+-\d*|-\d+)$/.test(options.range) || options.range.length > 64)) {
            throw new TypeError('HTTP Range requires passthrough and a valid single byte range');
        }
        if (payload.volume !== undefined && (!Number.isFinite(payload.volume) || payload.volume < 0 || payload.volume > 1000) ||
            payload.position !== undefined && (!Number.isFinite(payload.position) || payload.position < 0) ||
            payload.filters !== undefined && (!payload.filters || typeof payload.filters !== 'object' || Array.isArray(payload.filters))) {
            throw new TypeError('Invalid LoadStream playback options');
        }
        if (options.seekMode !== undefined && !['server', 'pcm-trim'].includes(options.seekMode)) {
            throw new TypeError('LoadStream seekMode must be server or pcm-trim');
        }
        const clientTrim = options.seekMode === 'pcm-trim';
        if (clientTrim) {
            if (payload.format !== undefined && !['raw', 'pcm'].includes(payload.format)) throw new TypeError('Client PCM seeking supports raw/pcm only; original bytes cannot be trimmed as PCM');
            assertClientPcmSeekPosition(payload.position ?? 0);
        }
        const requestPayload = clientTrim
            ? { ...payload, position: 0, format: 'raw' as const }
            : payload.format === 'pcm' ? { ...payload, format: 'raw' as const }
            : passthrough ? { ...payload, format: 'passthrough' as const } : payload;
        const route = this.extensionRoute('loadstream');
        const backend = this.node.backend;
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        try {
            const res = await this.streamRequest(this.url + route.path, {
                method: route.method,
                headers: options.range ? { ...this.jsonHeaders, Range: options.range } : this.jsonHeaders,
                body: requestPayload, signal: options.signal,
            }, options.timeoutMs ?? 100000);
            // A 200/206 alone does not guarantee audio. In particular, legacy
            // NodeLink may ignore the new passthrough request and emit PCM.
            // Destroy invalid responses before they can leak into a decoder.
            try {
                validateNodeLinkStreamResponse(res.headers, passthrough ? 'passthrough' :
                    requestPayload.format === 'wav' ? 'wav' : 'raw');
            } catch (error) {
                res.stream.destroy();
                throw error;
            }
            if (current()) backend?.recordFeature('loadstream', 'available');
            if (!clientTrim) return { stream: res.stream, headers: res.headers, statusCode: res.statusCode };
            const headers = { ...res.headers };
            // Local cropping changes output length and invalidates backend
            // range/length framing. Do not expose stale remote metadata.
            delete headers['content-length'];
            delete headers['content-range'];
            delete headers['transfer-encoding'];
            delete headers['accept-ranges'];
            return {
                stream: createClientPcmSeekStream(res.stream, payload.position ?? 0),
                headers, statusCode: res.statusCode,
            };
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
