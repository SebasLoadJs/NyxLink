import { readNodeLinkConnectionSnapshot, nodeLinkEncodeInput, readNodeLinkEncodedTrack, readNodeLinkEncodedTracks, type NodeLinkConnectionSnapshot, type NodeLinkTrackEncodeInput, nodeLinkMetricsHeader, type NodeLinkMetricsOptions, backendRestTimeout, readBackendInfoSnapshot, nodeLinkTrackStreamParameters, readNodeLinkTrackStreamInfo, type BackendInfoSnapshot, type BackendInfoOptions, type NodeLinkTrackStreamOptions, type NodeLinkTrackStreamInfo } from '../backends/BackendRestContracts';
import { javaTimedLyricsSearchPath, lyricsKtVideoPath, lyricsKtSearchPath, lyricsKtTimeout, readLyricsKtResult, readLyricsKtSearch, type LyricsKtOptions, type LyricsKtResult, type LyricsKtSearchTrack } from '../backends/LyricsKtContracts';
import { assertNodeLinkAdmin, readNodeLinkYoutubeConfig, nodeLinkYoutubeConfigBody, readNodeLinkYoutubeConfigAcknowledgement, nodeLinkWorkerTerminationBody, readNodeLinkWorkerTermination, type NodeLinkAdminOptions, type NodeLinkYoutubeConfig, type NodeLinkYoutubeConfigUpdate, type NodeLinkYoutubeConfigAcknowledgement, type NodeLinkWorkerTarget, type NodeLinkWorkerTerminationOptions, type NodeLinkWorkerTermination } from '../backends/NodeLinkAdminContracts';
import { profilerCommandBody, readProfilerCommandResult, type NodeLinkProfilerCommandOptions, type NodeLinkProfilerCommandResult, profilerQuery, diagnosticsTimeout, readNodeLinkProfilerSnapshot, readNodeLinkWorkerSnapshots, type NodeLinkProfilerOptions, type NodeLinkProfilerSnapshot, type NodeLinkWorkerSnapshot } from '../backends/NodeLinkDiagnostics';
import { hlsCreateQuery, hlsReadQuery, hlsTimeout, validateHlsManifest, type NodeLinkHlsOptions, type NodeLinkHlsReadOptions, type NodeLinkHlsManifest } from '../backends/NodeLinkHlsContracts';
import { assertYoutubeAdmin, youtubeTimeout, youtubeConfig, youtubeConfigBody, youtubeOAuthPath, youtubeOAuthToken, youtubeStreamPath, type LavalinkYoutubeAdminOptions, type LavalinkYoutubeConfig, type LavalinkYoutubeConfigUpdate, type LavalinkYoutubeOAuthToken, type LavalinkYoutubeStreamOptions, type LavalinkYoutubeStream } from '../backends/LavalinkYoutubeContracts';
import { renderBackendPluginPath, type BackendPluginRoute, type BackendPluginRequest, type BackendPluginBinaryResponse } from '../backends/BackendPluginRoutes';
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
        const relative = renderBackendPluginPath(route, options.params);
        const guildId = options.guildId;
        const path = route.scope === 'player' ? playerPath(session, guildId) + '/' + relative : (route.prefix === 'root' ? '/' : '/v4/') + relative;
        if (route.scope === 'node' && guildId !== undefined) throw new TypeError('Node-scoped plugin route does not accept a guild ID');
        const player = route.scope === 'player' ? manager.players.get(guildId!) : undefined;
        if (route.scope === 'player' && (!player || player.destroyed || player.node !== this.node)) throw new Error('Plugin player is not managed by this node');
        const current = () => !manager.destroyed && !this.node.destroyed && registry.owns(route) &&
            this.node.backend === backend && this.node.sessionId === session && this.node.socket === socket &&
            (!player || (!player.destroyed && player.node === this.node && manager.players.get(guildId!) === player));
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
        if (route.scope === 'player' && route.method !== 'GET') await manager.guildOwnership?.assertCurrent(guildId!);
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('Plugin request context changed');
        let response: unknown;
        try {
            const url = this.url + path + (query ? '?' + query : '');
            response = route.binary
                ? await this.readPluginBinary(route, url, body, timeout, options.signal, current)
                : await this.request<unknown>(url, {
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

    private async readPluginBinary(route: BackendPluginRoute<unknown>, url: string, body: string | undefined,
        timeout: number, callerSignal: AbortSignal | undefined, current: () => boolean): Promise<BackendPluginBinaryResponse> {
        const binary = route.binary!;
        const signal = callerSignal ? AbortSignal.any([callerSignal,AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
        signal.throwIfAborted();
        const response = await this.streamRequest(url, {
            method: route.method, headers: {...(body === undefined ? this.authHeaders : this.jsonHeaders), Accept:binary.contentTypes.join(', '), 'Accept-Encoding':'identity'},
            ...(body === undefined ? {} : {body}), signal,
        }, timeout);
        const stream = response.stream;
        const abort = () => stream.destroy();
        signal.addEventListener('abort',abort,{once:true});
        try {
            signal.throwIfAborted();
            if (!current()) throw new Error('Plugin request context changed');
            const mime = response.headers['content-type'];
            const contentType = typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase() : '';
            const encoding = response.headers['content-encoding'];
            if (response.statusCode !== 200 || !binary.contentTypes.includes(contentType) ||
                (encoding !== undefined && encoding !== 'identity')) throw new ProtocolResponseError('backend plugin', 'binary content type');
            const limit = binary.maxBytes ?? 4194304;
            const length = Number(response.headers['content-length']);
            if (Number.isFinite(length) && length > limit) throw new ProtocolResponseError('backend plugin', 'binary response limit');
            let size = 0;
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
                signal.throwIfAborted();
                if (!current()) throw new Error('Plugin request context changed');
                const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                size += bytes.length;
                if (size > limit) throw new ProtocolResponseError('backend plugin', 'binary response limit');
                chunks.push(bytes);
            }
            signal.throwIfAborted();
            if (!current()) throw new Error('Plugin request context changed');
            if (!size || (Number.isFinite(length) && size !== length)) throw new ProtocolResponseError('backend plugin', 'binary response length');
            return {bytes:Buffer.concat(chunks),contentType,statusCode:response.statusCode};
        } finally {
            signal.removeEventListener('abort',abort);
            if (!stream.complete || !stream.readableEnded) stream.destroy();
        }
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

    /** Typed backend metadata without replacing legacy raw info or mutating detection state. */
    public async getBackendInfo(options: BackendInfoOptions = {}): Promise<BackendInfoSnapshot> {
        const timeout = backendRestTimeout(options.timeoutMs);
        const backend = this.node.backend, socket = this.node.socket, session = this.node.sessionId;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.socket === socket && this.node.sessionId === session;
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('Backend info context changed');
        const result = await this.request<unknown>(this.url + '/v4/info', {
            method: 'GET', headers: this.authHeaders, signal: options.signal,
            returnHeaders: true, throwOnError: true, allowedOrigins: [new URL(this.url).origin],
        }, timeout, 0, 1000, 0);
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('Backend info context changed');
        if (!result) throw new ProtocolResponseError('backend REST', 'info response');
        return readBackendInfoSnapshot(result.data, result.headers);
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

    private async lyricsKtRequest<T>(feature: string, path: string, options: LyricsKtOptions,
        decode: (raw: unknown) => T, notFoundAsNull: boolean = false, plugin = 'lyrics'): Promise<T | null> {
        const backend = this.node.backend, socket = this.node.socket, session = this.node.sessionId;
        if (backend?.kind !== 'lavalink' || !backend.getPlugin(plugin) ||
            backend.featureStatus(feature) === 'unavailable') throw new FeatureUnavailableError(feature, backend?.kind ?? 'unknown');
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.socket === socket && this.node.sessionId === session;
        const timeout = lyricsKtTimeout(options.timeoutMs);
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('Lyrics.kt context changed');
        let raw: unknown;
        try {
            raw = await this.request<unknown>(this.url + path, {
                method: 'GET', headers: this.authHeaders, signal: options.signal,
                allowedOrigins: [new URL(this.url).origin], throwOnError: true,
            }, timeout, 0, 1000, 0);
        } catch (error) {
            const message = error instanceof HttpError && error.body && typeof error.body === 'object' && 'message' in error.body ? String(error.body.message) : '';
            if (notFoundAsNull && error instanceof HttpError && error.statusCode === 404 &&
                !/requested route was not found|unknown (?:route|endpoint)|(?:endpoint|feature).*disabled|no static resource/i.test(message)) {
                if (!current()) throw new Error('Lyrics.kt context changed');
                return null;
            }
            this.featureError(feature, error, backend, current);
        }
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('Lyrics.kt context changed');
        const result = decode(raw);
        backend.recordFeature(feature, 'available');
        return result;
    }

    public getLyricsKt(videoId: string, options: LyricsKtOptions = {}): Promise<LyricsKtResult | null> {
        return this.lyricsKtRequest('lyricskt:video', lyricsKtVideoPath(videoId), options, readLyricsKtResult, true);
    }

    public getCurrentLyricsKt(guildId: string, options: LyricsKtOptions = {}): Promise<LyricsKtResult | null> {
        return this.lyricsKtRequest('lyricskt:current', playerPath(this.node.sessionId, guildId) + '/lyrics', options, readLyricsKtResult, true);
    }

    public async searchLyricsKt(query: string, options: LyricsKtOptions = {}): Promise<LyricsKtSearchTrack[]> {
        const result = await this.lyricsKtRequest('lyricskt:search', lyricsKtSearchPath(query), options, readLyricsKtSearch);
        if (result === null) throw new ProtocolResponseError('Lyrics.kt', 'search response');
        return result;
    }

    /** Java Timed Lyrics standalone plugin, not the java-lavalyrics provider module. */
    public getJavaTimedLyrics(videoId: string, options: LyricsKtOptions = {}): Promise<LyricsKtResult | null> {
        return this.lyricsKtRequest('java-lyrics:video',lyricsKtVideoPath(videoId),options,readLyricsKtResult,true,'java-lyrics-plugin');
    }

    public getCurrentJavaTimedLyrics(guildId: string, options: LyricsKtOptions = {}): Promise<LyricsKtResult | null> {
        return this.lyricsKtRequest('java-lyrics:current',playerPath(this.node.sessionId,guildId) + '/lyrics',options,readLyricsKtResult,true,'java-lyrics-plugin');
    }

    public async searchJavaTimedLyrics(query: string, options: LyricsKtOptions = {}): Promise<LyricsKtSearchTrack[]> {
        const result = await this.lyricsKtRequest('java-lyrics:search:youtube',javaTimedLyricsSearchPath(query,'youtube'),options,readLyricsKtSearch,false,'java-lyrics-plugin');
        if (result === null) throw new ProtocolResponseError('Java Timed Lyrics','search response');
        return result;
    }

    /** Genius must be configured by the server operator. No automatic provider fallback. */
    public async searchJavaTimedLyricsGenius(query: string, options: LyricsKtOptions = {}): Promise<Extract<LyricsKtResult, {type: 'text'}> | null> {
        return this.lyricsKtRequest('java-lyrics:search:genius',javaTimedLyricsSearchPath(query,'genius'),options,raw => {
            const result = readLyricsKtResult(raw);
            if (result.type !== 'text') throw new ProtocolResponseError('Java Timed Lyrics','Genius text response');
            return result;
        },true,'java-lyrics-plugin');
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
    /** Detached connection diagnostics; a disabled manager is not a failed node. */
    public async getNodeLinkConnectionSnapshot(options: BackendInfoOptions = {}): Promise<NodeLinkConnectionSnapshot> {
        return this.readNativeDiagnostic('connection', {}, options, readNodeLinkConnectionSnapshot);
    }

    private async readNativeDiagnostic<T>(operation: ExtensionOperation, params: ExtensionRouteParameters,
        options: BackendInfoOptions, decode: (value: unknown) => T, body?: unknown): Promise<T> {
        const timeout = backendRestTimeout(options.timeoutMs);
        const route = this.extensionRoute(operation, params);
        this.node.assertFeature(route.feature);
        const backend = this.node.backend, socket = this.node.socket, session = this.node.sessionId;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.socket === socket && this.node.sessionId === session;
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('NodeLink diagnostic context changed');
        let raw: unknown;
        try {
            raw = await this.request<unknown>(this.url + route.path, {
                method:route.method, headers:body === undefined ? this.authHeaders : this.jsonHeaders,
                ...(body === undefined ? {} : {body}), signal:options.signal,
                allowedOrigins:[new URL(this.url).origin], throwOnError:true,
            },timeout,0,1000,0);
        } catch (error) {
            if (error instanceof HttpError) {
                const message = error.body && typeof error.body === 'object' && 'message' in error.body ? String(error.body.message) : '';
                if (error.statusCode === 501 || [403,404].includes(error.statusCode) && /requested route was not found|unknown (?:route|endpoint)|(?:endpoint|feature).*disabled/i.test(message)) {
                    if (current()) backend?.recordFeature(route.feature,'unavailable');
                    throw new FeatureUnavailableError(route.feature,backend?.kind ?? 'unknown',error.statusCode);
                }
                throw new HttpError(error.statusCode);
            }
            throw new Error('NodeLink diagnostic request failed');
        }
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('NodeLink diagnostic context changed');
        const result = decode(raw);
        backend?.recordFeature(route.feature,'available');
        return result;
    }

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
    /** Scrape optional NodeLink Prometheus metrics without changing playback health. */
    public async getNodeLinkMetrics(options: NodeLinkMetricsOptions = {}): Promise<string> {
        const authorization = nodeLinkMetricsHeader(this.url, options);
        const timeout = backendRestTimeout(options.timeoutMs);
        const route = this.extensionRoute('metrics');
        this.node.assertFeature(route.feature);
        const backend = this.node.backend, socket = this.node.socket, session = this.node.sessionId;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.socket === socket && this.node.sessionId === session;
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('NodeLink metrics context changed');
        let response: unknown;
        try {
            const result = await this.request<unknown>(this.url + route.path, {
                method: route.method, headers: {...this.authHeaders, ...(authorization === undefined ? {} : {Authorization:authorization}), Accept:'text/plain, application/openmetrics-text'},
                signal:options.signal, returnHeaders:true, throwOnError:true, allowedOrigins:[new URL(this.url).origin],
            }, timeout, 0, 1000, 0);
            if (result) {
                const contentType = result.headers['content-type'];
                if (typeof contentType === 'string' && /^(text\/plain|application\/openmetrics-text)(?:\s*;|$)/i.test(contentType)) response = result.data;
            }
        } catch (error) {
            if (error instanceof HttpError) {
                if (error.statusCode === 404 || error.statusCode === 501) {
                    if (current()) backend?.recordFeature(route.feature, 'unavailable');
                    throw new FeatureUnavailableError(route.feature, backend?.kind ?? 'unknown', error.statusCode);
                }
                throw new HttpError(error.statusCode);
            }
            throw new Error('NodeLink metrics request failed');
        }
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('NodeLink metrics context changed');
        if (typeof response !== 'string') throw new ProtocolResponseError('backend REST', 'metrics response');
        backend?.recordFeature(route.feature, 'available');
        return response;
    }

    public async getMetrics(): Promise<string | null> {
        this.node.assertFeature("metrics");

        const res = await this.featureRequest<string>("metrics", {}, {
            headers: this.authHeaders
        });

        return res || null;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    /** Read-only privileged diagnostics, never a remote inspector or arbitrary command channel. */
    public async getNodeLinkProfilerStatus(options: NodeLinkProfilerOptions): Promise<NodeLinkProfilerSnapshot> {
        const query = profilerQuery(this.url, options);
        const route = this.extensionRoute('profiler:status', { query });
        this.node.assertFeature(route.feature);
        const backend = this.node.backend, session = this.node.sessionId, socket = this.node.socket;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.sessionId === session && this.node.socket === socket;
        let raw: unknown;
        try {
            raw = await this.request<unknown>(this.url + route.path, {
                method: 'GET', headers: { ...this.authHeaders, 'X-NodeLink-Code': options.code },
                signal: options.signal, allowedOrigins: [new URL(this.url).origin], throwOnError: true,
            }, diagnosticsTimeout(options.timeoutMs), 0, 1000, 0);
        } catch (error) {
            // Keep remote error bodies and secrets out of diagnostics/logs.
            if (error instanceof HttpError) this.featureError(route.feature, new HttpError(error.statusCode), backend, current);
            throw new Error('NodeLink profiler request failed');
        }
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('NodeLink profiler session changed');
        const result = readNodeLinkProfilerSnapshot(raw, options.scope ?? 'all');
        backend?.recordFeature(route.feature, 'available');
        return result;
    }

    /** Explicit administrative action. A timeout does not imply rollback on the remote node. */
    public async runNodeLinkProfilerCommand(options: NodeLinkProfilerCommandOptions): Promise<NodeLinkProfilerCommandResult> {
        const body = profilerCommandBody(this.url, options);
        const route = this.extensionRoute('profiler:command');
        this.node.assertFeature(route.feature);
        const backend = this.node.backend, session = this.node.sessionId, socket = this.node.socket;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.sessionId === session && this.node.socket === socket;
        if (!current()) throw new Error('NodeLink profiler context changed');
        let raw: unknown;
        try {
            raw = await this.request<unknown>(this.url + route.path, {
                method: route.method, headers: {...this.jsonHeaders, 'X-NodeLink-Code':options.code}, body,
                signal:options.signal, allowedOrigins:[new URL(this.url).origin], throwOnError:true,
            }, diagnosticsTimeout(options.timeoutMs), 0, 1000, 0);
        } catch (error) {
            if (error instanceof HttpError) this.featureError(route.feature, new HttpError(error.statusCode), backend, current);
            throw new Error('NodeLink profiler command failed');
        }
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('NodeLink profiler context changed');
        const result = readProfilerCommandResult(raw, body.action, body.scope);
        backend?.recordFeature(route.feature, 'available');
        return result;
    }

    /** Validated, detached worker metrics; legacy getWorkers remains compatible. */
    public async getNodeLinkWorkerSnapshots(): Promise<NodeLinkWorkerSnapshot[]> {
        const route = this.extensionRoute('workers:get');
        this.node.assertFeature(route.feature);
        const backend = this.node.backend, session = this.node.sessionId, socket = this.node.socket;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.sessionId === session && this.node.socket === socket;
        try {
            const raw = await this.request<unknown>(this.url + route.path, {
                method: 'GET', headers: this.authHeaders, throwOnError: true,
                allowedOrigins: [new URL(this.url).origin],
            }, 10000, 0, 1000, 0);
            if (!current()) throw new Error('NodeLink worker session changed');
            const result = readNodeLinkWorkerSnapshots(raw);
            backend?.recordFeature(route.feature, 'available');
            return result;
        } catch (error) { this.featureError(route.feature, error, backend, current); }
    }

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
    private youtubePluginContext(feature: string) {
        const backend = this.node.backend, socket = this.node.socket, session = this.node.sessionId;
        if (this.node.destroyed || this.node.manager.destroyed || backend?.kind !== 'lavalink' ||
            !backend.getPlugin('youtube-plugin') || backend.featureStatus(feature) === 'unavailable') {
            throw new FeatureUnavailableError(feature, backend?.kind ?? 'unknown');
        }
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.socket === socket && this.node.sessionId === session;
        return { backend, current };
    }

    private async youtubeAdminRequest<T>(feature: string, path: string, method: 'GET' | 'POST',
        options: LavalinkYoutubeAdminOptions, decode: (value: unknown) => T, body?: LavalinkYoutubeConfigUpdate): Promise<T> {
        assertYoutubeAdmin(this.url, options);
        const { backend, current } = this.youtubePluginContext(feature);
        let raw: unknown;
        try {
            raw = await this.request<unknown>(this.url + path, {
                method, headers: body === undefined ? this.authHeaders : this.jsonHeaders,
                ...(body === undefined ? {} : { body }), signal: options.signal,
                allowedOrigins: [new URL(this.url).origin], throwOnError: true, noContentAsNull: true,
            }, youtubeTimeout(options.timeoutMs), 0, 1000, 0);
        } catch (error) {
            // Remote error bodies and native error causes can echo OAuth tokens.
            // Keep the status only; never expose the request URL or remote text.
            if (error instanceof HttpError) this.featureError(feature, new HttpError(error.statusCode), backend, current);
            throw new Error('YouTube plugin administrative request failed');
        }
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('YouTube plugin session changed');
        const result = decode(raw);
        backend.recordFeature(feature, 'available');
        return result;
    }

    public getLavalinkYoutubeConfig(options: LavalinkYoutubeAdminOptions): Promise<LavalinkYoutubeConfig> {
        return this.youtubeAdminRequest('lavalink:youtube:config:get', '/youtube', 'GET', options, youtubeConfig);
    }

    public async updateLavalinkYoutubeConfig(payload: LavalinkYoutubeConfigUpdate, options: LavalinkYoutubeAdminOptions): Promise<void> {
        const body = youtubeConfigBody(payload);
        await this.youtubeAdminRequest('lavalink:youtube:config:update', '/youtube', 'POST', options, value => {
            if (value !== null) throw new ProtocolResponseError('YouTube plugin', 'configuration acknowledgement');
        }, body);
    }

    public exchangeLavalinkYoutubeOAuth(refreshToken: string, options: LavalinkYoutubeAdminOptions): Promise<LavalinkYoutubeOAuthToken> {
        return this.youtubeAdminRequest('lavalink:youtube:oauth', youtubeOAuthPath(refreshToken), 'GET', options, youtubeOAuthToken);
    }

    /** Return original audio/video bytes; not decoded PCM and not a seek API. */
    public async loadLavalinkYoutubeStream(videoId: string, options: LavalinkYoutubeStreamOptions = {}): Promise<LavalinkYoutubeStream> {
        const feature = 'lavalink:youtube:stream';
        const path = youtubeStreamPath(videoId, options);
        const timeout = youtubeTimeout(options.timeoutMs);
        options.signal?.throwIfAborted();
        const { backend, current } = this.youtubePluginContext(feature);
        try {
            const response = await this.streamRequest(this.url + path, {
                method: 'GET', headers: this.authHeaders, signal: options.signal,
            }, timeout);
            const media = response.headers['content-type'];
            if (!current() || options.signal?.aborted) {
                response.stream.destroy();
                throw new Error('YouTube stream session changed');
            }
            if (response.statusCode !== 200 || typeof media !== 'string' || !/^(?:audio|video)\//i.test(media)) {
                response.stream.destroy();
                throw new ProtocolResponseError('YouTube plugin', 'stream content type');
            }
            backend.recordFeature(feature, 'available');
            return response;
        } catch (error) { this.featureError(feature, error, backend, current); }
    }

    private async nodeLinkAdminRequest<T>(operation: ExtensionOperation, options: NodeLinkAdminOptions,
        decode: (value: unknown) => T, body?: object, query?: URLSearchParams): Promise<T> {
        assertNodeLinkAdmin(this.url, options);
        const route = this.extensionRoute(operation, { query });
        this.node.assertFeature(route.feature);
        const backend = this.node.backend, session = this.node.sessionId, socket = this.node.socket;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.sessionId === session && this.node.socket === socket;
        if (!current()) throw new Error('NodeLink administration context changed');
        let raw: unknown;
        try {
            raw = await this.request<unknown>(this.url + route.path, {
                method: route.method, headers: body === undefined ? this.authHeaders : this.jsonHeaders,
                ...(body === undefined ? {} : { body }), signal: options.signal,
                allowedOrigins: [new URL(this.url).origin], throwOnError: true,
            }, diagnosticsTimeout(options.timeoutMs), 0, 1000, 0);
        } catch (error) {
            if (error instanceof HttpError) this.featureError(route.feature, new HttpError(error.statusCode), backend, current);
            throw new Error('NodeLink administrative request failed');
        }
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('NodeLink administration context changed');
        const result = decode(raw);
        backend?.recordFeature(route.feature, 'available');
        return result;
    }

    public getNodeLinkYoutubeConfig(options: NodeLinkAdminOptions, validate: boolean = false): Promise<NodeLinkYoutubeConfig> {
        if (typeof validate !== 'boolean') throw new TypeError('Invalid YouTube validation flag');
        return this.nodeLinkAdminRequest('youtube:config:get', options, readNodeLinkYoutubeConfig, undefined,
            validate ? new URLSearchParams({ validate: 'true' }) : undefined);
    }

    public updateNodeLinkYoutubeConfig(payload: NodeLinkYoutubeConfigUpdate, options: NodeLinkAdminOptions): Promise<NodeLinkYoutubeConfigAcknowledgement> {
        const body = nodeLinkYoutubeConfigBody(payload);
        return this.nodeLinkAdminRequest('youtube:config:update', options, raw => readNodeLinkYoutubeConfigAcknowledgement(raw, body), body);
    }

    /** Explicitly privileged, potentially disruptive operation; never used by automatic failover. */
    public terminateNodeLinkWorker(target: NodeLinkWorkerTarget, options: NodeLinkWorkerTerminationOptions): Promise<NodeLinkWorkerTermination> {
        const body = nodeLinkWorkerTerminationBody(target, options);
        const identity = { ...target };
        return this.nodeLinkAdminRequest('workers:patch', options, raw => readNodeLinkWorkerTermination(raw, identity), body);
    }

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
        if (typeof refreshToken !== 'string' || refreshToken.length < 1 || refreshToken.length > 16384 ||
            /[\x00-\x20\x7f]/.test(refreshToken)) throw new TypeError('Invalid YouTube refresh token');
        const origin = new URL(this.url);
        if (origin.protocol !== 'https:' && !['127.0.0.1', '[::1]'].includes(origin.hostname)) {
            throw new TypeError('NodeLink YouTube OAuth requires HTTPS or literal loopback HTTP');
        }
        const route = this.extensionRoute('youtube:oauth');
        this.node.assertFeature(route.feature);
        const backend = this.node.backend, session = this.node.sessionId, socket = this.node.socket;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.sessionId === session && this.node.socket === socket;
        if (!current()) throw new Error('NodeLink YouTube OAuth context changed');
        let raw: unknown;
        try {
            raw = await this.request<unknown>(origin.origin + route.path, {
                method: route.method, headers: this.jsonHeaders, body: { refreshToken },
                allowedOrigins: [origin.origin], throwOnError: true,
            }, 10000, 0, 1000, 0);
        } catch (error) {
            // Never propagate remote error bodies or URLs that may contain credentials.
            if (error instanceof HttpError) this.featureError(route.feature, new HttpError(error.statusCode), backend, current);
            throw new Error('NodeLink YouTube OAuth request failed');
        }
        if (!current()) throw new Error('NodeLink YouTube OAuth context changed');
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
            typeof (raw as Record<string, unknown>).access_token !== 'string' ||
            !(raw as Record<string, unknown>).access_token) {
            throw new ProtocolResponseError('NodeLink YouTube OAuth', 'token response');
        }
        backend?.recordFeature(route.feature, 'available');
        return raw;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    /** Encode a track on NodeLink using the native validated info contract. */
    public async encodeNodeLinkTrack(track: NodeLinkTrackEncodeInput, options: BackendInfoOptions = {}): Promise<string> {
        const body = nodeLinkEncodeInput(track);
        const query = new URLSearchParams({track:JSON.stringify(body)});
        if (query.toString().length > 16384) throw new TypeError('Single track encode query too large; use batch encoding');
        return this.readNativeDiagnostic('encodetrack',{query},options,readNodeLinkEncodedTrack);
    }

    public async encodeNodeLinkTracks(tracks: readonly NodeLinkTrackEncodeInput[], options: BackendInfoOptions = {}): Promise<string[]> {
        if (!Array.isArray(tracks) || !tracks.length || tracks.length > 128) throw new TypeError('Invalid NodeLink track batch');
        const body = tracks.map(nodeLinkEncodeInput);
        if (Buffer.byteLength(JSON.stringify(body)) > 262144) throw new TypeError('NodeLink track batch too large');
        return this.readNativeDiagnostic('encodedtracks',{},options,value=>readNodeLinkEncodedTracks(value,body.length),body);
    }

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
    /** Resolve provider metadata only; does not open or proxy the returned stream URL. */
    public async getNodeLinkTrackStreamInfo(encodedTrack: string, options: NodeLinkTrackStreamOptions = {}): Promise<NodeLinkTrackStreamInfo> {
        const query = nodeLinkTrackStreamParameters(encodedTrack, options);
        const timeout = backendRestTimeout(options.timeoutMs);
        const route = this.extensionRoute('trackstream', {query});
        this.node.assertFeature(route.feature);
        const backend = this.node.backend, socket = this.node.socket, session = this.node.sessionId;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.socket === socket && this.node.sessionId === session;
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('NodeLink track stream context changed');
        let raw: unknown;
        try {
            raw = await this.request<unknown>(this.url + route.path, {
                method: route.method, headers: this.authHeaders, signal: options.signal,
                allowedOrigins: [new URL(this.url).origin], throwOnError: true,
            }, timeout, 0, 1000, 0);
        } catch (error) {
            if (error instanceof HttpError) {
                const message = error.body && typeof error.body === 'object' && 'message' in error.body ? String(error.body.message) : '';
                if (error.statusCode === 501 || [403,404].includes(error.statusCode) && /requested route was not found|unknown (?:route|endpoint)|(?:endpoint|feature).*disabled/i.test(message)) {
                    if (current()) backend?.recordFeature(route.feature, 'unavailable');
                    throw new FeatureUnavailableError(route.feature, backend?.kind ?? 'unknown', error.statusCode);
                }
                throw new HttpError(error.statusCode);
            }
            throw new Error('NodeLink track stream request failed');
        }
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('NodeLink track stream context changed');
        const result = readNodeLinkTrackStreamInfo(raw);
        backend?.recordFeature(route.feature, 'available');
        return result;
    }

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
    private async hlsBytes(operation: 'hls:playlist' | 'hls:init' | 'hls:segment', query: URLSearchParams,
        options: NodeLinkHlsReadOptions): Promise<Buffer> {
        const route = this.extensionRoute(operation, { query });
        this.node.assertFeature(route.feature);
        const backend = this.node.backend, socket = this.node.socket, session = this.node.sessionId;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed &&
            this.node.backend === backend && this.node.socket === socket && this.node.sessionId === session;
        const timeout = hlsTimeout(options.timeoutMs);
        const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
        signal.throwIfAborted();
        const limit = operation === 'hls:playlist' ? 4 * 1024 * 1024 : 16 * 1024 * 1024;
        try {
            const response = await this.streamRequest(this.url + route.path, { method: 'GET', headers: this.authHeaders, signal }, timeout);
            const stream = response.stream;
            const abort = () => stream.destroy();
            signal.addEventListener('abort', abort, { once: true });
            try {
                signal.throwIfAborted();
                if (!current()) throw new Error('HLS session changed');
                const mime = response.headers['content-type'];
                const expected = operation === 'hls:playlist' ? 'application/vnd.apple.mpegurl' : operation === 'hls:init' ? 'video/mp4' : 'video/iso.segment';
                if (response.statusCode !== 200 || typeof mime !== 'string' || mime.split(';')[0].trim().toLowerCase() !== expected) throw new ProtocolResponseError('NodeLink HLS', 'content type');
                const length = Number(response.headers['content-length']);
                if (Number.isFinite(length) && length > limit) throw new ProtocolResponseError('NodeLink HLS', 'response limit');
                const chunks: Buffer[] = [];
                let size = 0;
                for await (const chunk of stream) {
                    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    size += bytes.length;
                    if (size > limit) throw new ProtocolResponseError('NodeLink HLS', 'response limit');
                    chunks.push(bytes);
                }
                signal.throwIfAborted();
                if (!current()) throw new Error('HLS session changed');
                if (!size) throw new ProtocolResponseError('NodeLink HLS', 'empty response');
                const result = Buffer.concat(chunks);
                if (operation === 'hls:playlist') validateHlsManifest(result.toString('utf8'), query.get('sessionId')!);
                backend?.recordFeature(route.feature, 'available');
                return result;
            } finally {
                signal.removeEventListener('abort', abort);
                if (!stream.complete) stream.destroy();
            }
        } catch (error) { this.featureError(route.feature, error, backend, current); }
    }

    /** Create an isolated native HLS session; no browser-visible node credentials. */
    public async createHlsSession(encodedTrack: string, options: NodeLinkHlsOptions = {}): Promise<NodeLinkHlsManifest> {
        const { sessionId, query } = hlsCreateQuery(encodedTrack, options);
        const bytes = await this.hlsBytes('hls:playlist', query, options);
        return { sessionId, playlist: bytes.toString('utf8') };
    }

    public async getHlsPlaylist(sessionId: string, options: NodeLinkHlsReadOptions = {}): Promise<NodeLinkHlsManifest> {
        const bytes = await this.hlsBytes('hls:playlist', hlsReadQuery(sessionId), options);
        return { sessionId, playlist: bytes.toString('utf8') };
    }

    public getHlsInitSegment(sessionId: string, options: NodeLinkHlsReadOptions = {}): Promise<Buffer> {
        return this.hlsBytes('hls:init', hlsReadQuery(sessionId), options);
    }

    public getHlsSegment(sessionId: string, index: number, options: NodeLinkHlsReadOptions = {}): Promise<Buffer> {
        if (index === undefined) throw new TypeError('HLS segment index is required');
        return this.hlsBytes('hls:segment', hlsReadQuery(sessionId, index), options);
    }

    public async getStreamFormats(encodedTrack: string, options: { itag?: number; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<NodeLinkStreamFormats> {
        this.node.assertFeature('loadstream');
        if (typeof encodedTrack !== 'string' || !encodedTrack.trim()) throw new TypeError('Stream formats require an encoded track');
        if (options.itag !== undefined && (!Number.isSafeInteger(options.itag) || options.itag <= 0)) throw new TypeError('itag must be a positive integer');
        if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30000)) throw new RangeError('Invalid stream formats timeout');
        const route = this.extensionRoute('loadstream');
        const backend = this.node.backend;
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && !this.node.manager.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('NodeLink stream context changed');
        try {
            const response = await this.request<unknown>(this.url + route.path, {
                method: route.method, headers: this.jsonHeaders,
                body: { encodedTrack, format: 'formats', ...(options.itag !== undefined ? { itag: options.itag } : {}) },
                signal: options.signal, throwOnError: true, allowedOrigins: [new URL(this.url).origin],
            }, options.timeoutMs ?? 10000, 0, 1000, 0);
            options.signal?.throwIfAborted();
            if (!current()) throw new Error('NodeLink stream context changed');
            validateNodeLinkStreamFormats(response);
            backend?.recordFeature('loadstream', 'available');
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
        if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 300000)) throw new RangeError('Invalid loadStream timeout');
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
        const current = () => !this.node.destroyed && !this.node.manager.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        options.signal?.throwIfAborted();
        if (!current()) throw new Error('NodeLink stream context changed');
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
                options.signal?.throwIfAborted();
                if (!current()) throw new Error('NodeLink stream context changed');
                validateNodeLinkStreamResponse(res.headers, passthrough ? 'passthrough' :
                    requestPayload.format === 'wav' ? 'wav' : 'raw');
            } catch (error) {
                res.stream.destroy();
                throw error;
            }
            backend?.recordFeature('loadstream', 'available');
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
