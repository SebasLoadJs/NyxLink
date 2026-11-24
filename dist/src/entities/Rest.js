"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rest = exports.RestError = void 0;
const OpenTelemetry_1 = require("../observability/OpenTelemetry");
const ManagerLogRoute_1 = require("../logging/ManagerLogRoute");
const NodeLinkOrchestration_1 = require("../backends/NodeLinkOrchestration");
const NodeLinkContracts_1 = require("../backends/NodeLinkContracts");
const LavaLyricsContracts_1 = require("../backends/LavaLyricsContracts");
const LavalinkSponsorBlockContracts_1 = require("../backends/LavalinkSponsorBlockContracts");
const ProtocolValidation_1 = require("../backends/ProtocolValidation");
const HttpError_1 = require("../errors/HttpError");
const ExtensionRoutes_1 = require("../backends/ExtensionRoutes");
const ProtocolContracts_1 = require("../backends/ProtocolContracts");
const FeatureUnavailableError_1 = require("../errors/FeatureUnavailableError");
const Util_1 = require("../Util");
const PlaybackGuard_1 = require("../players/PlaybackGuard");
const NodeLinkStreamResponse_1 = require("../backends/NodeLinkStreamResponse");
const ClientPCMSeek_1 = require("../backends/ClientPCMSeek");
const NodeLinkMixContracts_1 = require("../backends/NodeLinkMixContracts");
class RestError extends Error {
    statusCode;
    isSessionExpired;
    constructor(message, statusCode) {
        super(message);
        this.name = 'RestError';
        this.statusCode = statusCode;
        this.isSessionExpired = statusCode === 404;
    }
}
exports.RestError = RestError;
class Rest {
    node;
    authHeaders;
    jsonHeaders;
    userAgentHeaders;
    sessionRecoveries = new WeakSet();
    request;
    streamRequest;
    constructor(node) {
        this.node = node;
        this.request = this.observeTransport(Util_1.makeRequest, 'REST.http');
        this.streamRequest = this.observeTransport(Util_1.makeStreamRequest, 'REST.stream.open');
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
    get url() {
        return `http${this.node.secure ? "s" : ""}://${this.node.host}:${this.node.port}`;
    }
    observeTransport(transport, operation) {
        return new Proxy(transport, { apply: (target, receiver, args) => {
                const monitor = this.node.manager.performanceMonitor;
                const execute = () => monitor ? monitor.measure(operation === 'REST.http' ? 'rest' : 'streamOpen', () => Reflect.apply(target, receiver, args)) : Reflect.apply(target, receiver, args);
                const run = () => (0, OpenTelemetry_1.observeOperation)(this.node.manager, 'nyxlink.rest', async () => {
                    const aurora = (0, ManagerLogRoute_1.getManagerLogRoute)(this.node.manager);
                    return aurora ? aurora.observe(operation === 'REST.http' ? 'rest' : 'stream', async () => execute(), { backend: this.node.backend?.kind }, result => {
                        if (operation === 'REST.http' && typeof result === 'object' && result !== null && result.loadType === 'error') {
                            try {
                                if (new URL(args[0]).pathname === '/v4/loadtracks')
                                    return 'failed';
                            }
                            catch { }
                        }
                        return 'completed';
                    }) : execute();
                }, result => {
                    if (result == null)
                        return 'empty';
                    let pathname = '';
                    try {
                        pathname = new URL(args[0]).pathname;
                    }
                    catch { }
                    if (pathname === '/v4/loadtracks' && typeof result === 'object') {
                        const type = result.loadType;
                        if (type === 'error' || type === 'empty')
                            return type;
                    }
                    return 'resolved';
                });
                return run();
            } });
    }
    async triggerPlayerRecovery(player) {
        if (player.destroyed || this.node.destroyed || player.node !== this.node)
            return;
        player.stuckDetectionCount = 0;
        player.silentDetectionCount = 0;
        const guard = (0, PlaybackGuard_1.playbackGuard)(player);
        let ticket = guard.ticket;
        const active = () => !player.destroyed && !this.node.destroyed &&
            player.node === this.node && this.node.manager.players.get(player.guildId) === player &&
            guard.isCurrent(ticket);
        try {
            const recovering = player.softRestart("Session expired (404)");
            ticket = guard.ticket;
            const recovered = await recovering;
            if (!active())
                return;
            if (recovered) {
                this.node.manager.emit("playerRecoverySuccess", player);
            }
            else {
                await player.destroy("Session expired and recovery failed");
            }
        }
        catch (error) {
            if (!active())
                return;
            this.node.manager.emit("debug", `NyxLink > Rest > Recovery error: ${error.message}`);
            if (active())
                await player.destroy("Session recovery error");
        }
    }
    extensionRoute(operation, params = {}) {
        const parameters = { ...params, sessionId: this.node.sessionId };
        return this.node.backend ? this.node.backend.resolveExtension(operation, parameters)
            : (0, ExtensionRoutes_1.resolveExtensionRoute)(this.node.isNodeLink ? 'nodelink' : 'unknown', operation, parameters);
    }
    async featureRequest(operation, params, options, validate) {
        return this.runFeatureRequest(operation, params, options, validate);
    }
    async runFeatureRequest(operation, params, options, validate) {
        const route = this.extensionRoute(operation, params);
        if (params.guildId && route.method !== 'GET') {
            await this.node.manager.guildOwnership?.assertCurrent(params.guildId);
        }
        const feature = route.feature;
        this.node.assertFeature(feature);
        if (route.transport !== 'json')
            throw new TypeError('Extension requires stream transport');
        const backend = this.node.backend;
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        const result = await this.node.circuit.run(async () => {
            try {
                return await this.request(this.url + route.path, { ...options, method: route.method, throwOnError: true }, 10000, 0);
            }
            catch (error) {
                this.featureError(feature, error, backend, current);
            }
        });
        if (result === undefined)
            throw new Error('Backend did not acknowledge feature request');
        validate?.(result);
        if (current())
            backend?.recordFeature(feature, 'available');
        return result;
    }
    featureError(feature, error, backend, current) {
        const body = error instanceof HttpError_1.HttpError ? error.body : undefined;
        const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : '';
        const unavailable = error instanceof HttpError_1.HttpError && (error.statusCode === 501 ||
            [403, 404].includes(error.statusCode) && /requested route was not found|unknown (?:route|endpoint)|(?:endpoint|feature).*disabled/i.test(message));
        if (unavailable) {
            if (current())
                backend?.recordFeature(feature, 'unavailable');
            throw new FeatureUnavailableError_1.FeatureUnavailableError(feature, backend?.kind ?? 'unknown', error.statusCode);
        }
        throw error;
    }
    async getGroups() {
        return this.featureRequest('groups:list', {}, { headers: this.authHeaders }, NodeLinkOrchestration_1.validateGroups);
    }
    async getGroup(groupId) {
        (0, NodeLinkOrchestration_1.requireGroupId)(groupId);
        return this.featureRequest('groups:get', { groupId }, { headers: this.authHeaders }, value => (0, NodeLinkOrchestration_1.validateGroup)(value, groupId));
    }
    async createGroup(options) {
        const body = (0, NodeLinkOrchestration_1.groupCreateBody)(options);
        return this.featureRequest('groups:create', {}, { headers: this.jsonHeaders, body }, value => (0, NodeLinkOrchestration_1.validateGroup)(value, body.id));
    }
    async updateGroup(groupId, options) {
        (0, NodeLinkOrchestration_1.requireGroupId)(groupId);
        return this.featureRequest('groups:update', { groupId }, { headers: this.jsonHeaders, body: (0, NodeLinkOrchestration_1.groupPatchBody)(options) }, value => (0, NodeLinkOrchestration_1.validateGroupPatch)(value, groupId));
    }
    async deleteGroup(groupId) {
        (0, NodeLinkOrchestration_1.requireGroupId)(groupId);
        await this.featureRequest('groups:delete', { groupId }, { headers: this.authHeaders });
    }
    async lavalinkSponsorBlockRequest(method, guildId, categories) {
        if (method !== 'GET')
            await this.node.manager.guildOwnership?.assertCurrent(guildId);
        const path = (0, LavalinkSponsorBlockContracts_1.lavalinkSponsorBlockPath)(this.node.sessionId, guildId);
        const body = method === 'PUT' ? (0, LavalinkSponsorBlockContracts_1.sponsorBlockCategoryBody)(categories) : undefined;
        const backend = this.node.backend;
        if (backend?.kind !== 'lavalink' || !(0, LavalinkSponsorBlockContracts_1.hasLavalinkSponsorBlockPlugin)(backend.plugins) ||
            backend.featureStatus('lavalink:sponsorblock') === 'unavailable') {
            throw new FeatureUnavailableError_1.FeatureUnavailableError('lavalink:sponsorblock', backend?.kind ?? 'unknown');
        }
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        const result = await this.node.circuit.run(async () => {
            try {
                return await this.request(this.url + path, {
                    method, headers: method === 'PUT' ? this.jsonHeaders : this.authHeaders,
                    ...(method === 'PUT' ? { body } : {}), throwOnError: true
                }, 10000, 0);
            }
            catch (error) {
                this.featureError('lavalink:sponsorblock', error, backend, current);
            }
        });
        if (method === 'GET')
            (0, LavalinkSponsorBlockContracts_1.validateSponsorBlockCategories)(result);
        if (result === undefined)
            throw new ProtocolValidation_1.ProtocolResponseError('Lavalink SponsorBlock', 'response');
        if (current())
            backend.recordFeature('lavalink:sponsorblock', 'available');
        return method === 'GET' ? [...result] : undefined;
    }
    getLavalinkSponsorBlockCategories(guildId) {
        return this.lavalinkSponsorBlockRequest('GET', guildId);
    }
    async setLavalinkSponsorBlockCategories(guildId, categories) {
        await this.lavalinkSponsorBlockRequest('PUT', guildId, categories);
    }
    async clearLavalinkSponsorBlockCategories(guildId) {
        await this.lavalinkSponsorBlockRequest('DELETE', guildId);
    }
    async getSponsorBlock(guildId) {
        (0, NodeLinkOrchestration_1.requireGuildId)(guildId);
        return this.featureRequest('sponsorblock:get', { guildId }, { headers: this.authHeaders }, NodeLinkOrchestration_1.validateSponsorState);
    }
    async updateSponsorBlock(guildId, options) {
        (0, NodeLinkOrchestration_1.requireGuildId)(guildId);
        return this.featureRequest('sponsorblock:update', { guildId }, { headers: this.jsonHeaders, body: (0, NodeLinkOrchestration_1.sponsorOptionsBody)(options) }, NodeLinkOrchestration_1.validateSponsorState);
    }
    async setSponsorBlockSegments(guildId, segments) {
        (0, NodeLinkOrchestration_1.requireGuildId)(guildId);
        return this.featureRequest('sponsorblock:segments', { guildId }, { headers: this.jsonHeaders, body: (0, NodeLinkOrchestration_1.sponsorSegmentsBody)(segments) }, NodeLinkOrchestration_1.validateSponsorState);
    }
    async clearSponsorBlock(guildId) {
        (0, NodeLinkOrchestration_1.requireGuildId)(guildId);
        await this.featureRequest('sponsorblock:clear', { guildId }, { headers: this.authHeaders });
    }
    async getPlayers() {
        const res = await this.request(`${this.url}/v4/sessions/${this.node.sessionId}/players`, {
            method: "GET",
            headers: this.authHeaders
        });
        if (res === undefined || res === null)
            return null;
        if (!Array.isArray(res))
            throw new ProtocolValidation_1.ProtocolResponseError('get players', 'player array');
        const players = [];
        for (const row of res) {
            (0, ProtocolValidation_1.validatePlayerRead)(row);
            players.push(row);
        }
        return players;
    }
    async getPlayer(guildId) {
        const res = await this.request(`${this.url}/v4/sessions/${this.node.sessionId}/players/${guildId}`, {
            method: "GET",
            headers: this.authHeaders
        });
        if (res === undefined || res === null)
            return null;
        (0, ProtocolValidation_1.validatePlayerRead)(res, guildId);
        return res;
    }
    async updatePlayer(guildId, data, noReplace = false) {
        return this.updatePlayerRequest(guildId, data, noReplace);
    }
    async updatePlayerRequest(guildId, data, noReplace) {
        await this.node.manager.guildOwnership?.assertCurrent(guildId);
        const payload = this.node.backend ? this.node.backend.preparePlayerUpdate(data) : (0, ProtocolContracts_1.preparePlayerUpdate)(this.node.isNodeLink ? 'nodelink' : 'unknown', data);
        const params = new URLSearchParams();
        if (noReplace) {
            params.append("noReplace", "true");
        }
        const owner = this.node.manager.players.get(guildId);
        const intent = owner ? (0, PlaybackGuard_1.playbackGuard)(owner).ticket : undefined;
        const session = this.node.sessionId;
        try {
            const res = await this.node.circuit.run(() => this.request(`${this.url}/v4/sessions/${session}/players/${guildId}?${params.toString()}`, {
                method: "PATCH",
                headers: this.jsonHeaders,
                body: payload,
                throwOnError: true
            }, undefined, 0));
            if (res === undefined || res === null)
                return null;
            (0, ProtocolValidation_1.validatePlayerAcknowledgement)(res, guildId);
            return res;
        }
        catch (error) {
            if (error instanceof HttpError_1.HttpError && error.statusCode === 404 &&
                owner && !owner.destroyed && !this.node.destroyed && owner.node === this.node &&
                this.node.manager.players.get(guildId) === owner && this.node.sessionId === session &&
                (0, PlaybackGuard_1.playbackGuard)(owner).isCurrent(intent) && !this.sessionRecoveries.has(owner)) {
                this.sessionRecoveries.add(owner);
                void this.triggerPlayerRecovery(owner)
                    .catch(error => this.node.manager.emit("debug", `NyxLink > Rest > Recovery failed: ${error.message}`))
                    .finally(() => { this.sessionRecoveries.delete(owner); });
            }
            throw error;
        }
    }
    async destroyPlayer(guildId, options) {
        await this.node.manager.guildOwnership?.assertCurrent(guildId);
        const timeout = options?.timeoutMs ?? 10000;
        if (options && (!Number.isFinite(timeout) || timeout <= 0 || timeout > 60000))
            throw new TypeError('Cleanup timeout must be within 1..60000 ms');
        try {
            await this.request(`${this.url}/v4/sessions/${this.node.sessionId}/players/${guildId}`, {
                method: "DELETE",
                headers: this.authHeaders,
                signal: options?.signal,
                throwOnError: options !== undefined
            }, options ? timeout : undefined, options ? 0 : undefined);
        }
        catch (error) {
            const err = error;
            if (!err.message.includes('status 404')) {
                throw error;
            }
        }
    }
    async loadTracks(identifier, options) {
        const params = new URLSearchParams();
        params.append("identifier", identifier);
        const protectedRequest = this.node.circuit.enabled;
        return this.node.circuit.run(async () => {
            const res = await this.request(`${this.url}/v4/loadtracks?${params}`, {
                method: "GET",
                headers: this.authHeaders,
                throwOnError: protectedRequest || options !== undefined,
                signal: options?.signal
            }, options?.timeoutMs ?? 10000, protectedRequest || options ? 0 : 3);
            if (res === undefined || res === null)
                return { loadType: "empty", data: {} };
            (0, ProtocolValidation_1.validateLoadResponse)(res);
            return res;
        });
    }
    async decodeTrack(encodedTrack) {
        const params = new URLSearchParams();
        params.append("encodedTrack", encodedTrack);
        const res = await this.request(`${this.url}/v4/decodetrack?${params}`, {
            method: "GET",
            headers: this.authHeaders
        });
        if (res === undefined || res === null)
            return null;
        (0, ProtocolValidation_1.validateTrackResponse)(res);
        return res;
    }
    async decodeTracks(encodedTracks) {
        const res = await this.request(`${this.url}/v4/decodetracks`, {
            method: "POST",
            headers: this.jsonHeaders,
            body: encodedTracks
        });
        if (res === undefined || res === null)
            return null;
        if (!Array.isArray(res))
            throw new ProtocolValidation_1.ProtocolResponseError('decode tracks', 'track array');
        for (const track of res)
            (0, ProtocolValidation_1.validateTrackResponse)(track, 'decode tracks');
        return res;
    }
    async getInfo() {
        const res = await this.request(`${this.url}/v4/info`, {
            method: "GET",
            headers: this.authHeaders
        });
        return res || null;
    }
    async getInfoWithHeaders() {
        const res = await this.request(`${this.url}/v4/info`, {
            method: "GET",
            headers: this.authHeaders,
            returnHeaders: true,
            throwOnError: true
        }, 10000, 0);
        return res || null;
    }
    async getVersion(timeout, retries) {
        const res = await this.request(`${this.url}/version`, {
            method: "GET",
            headers: this.authHeaders
        }, timeout, retries);
        return res || null;
    }
    async getStats() {
        const protectedRequest = this.node.circuit.enabled;
        const res = await this.node.circuit.run(async () => {
            const stats = await this.request(`${this.url}/v4/stats`, {
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
    async getRoutePlannerStatus() {
        const res = await this.request(`${this.url}/v4/routeplanner/status`, {
            method: "GET",
            headers: this.authHeaders
        });
        return res || null;
    }
    async freeFailedAddress(address) {
        await this.request(`${this.url}/v4/routeplanner/free/address`, {
            method: "POST",
            headers: this.jsonHeaders,
            body: { address }
        });
    }
    async freeAllFailedAddresses() {
        await this.request(`${this.url}/v4/routeplanner/free/all`, {
            method: "POST",
            headers: this.authHeaders
        });
    }
    async updateSession(resuming, timeout) {
        const res = await this.request(`${this.url}/v4/sessions/${this.node.sessionId}`, {
            method: "PATCH",
            headers: this.jsonHeaders,
            body: {
                resuming,
                timeout
            }
        });
        if (res === undefined || res === null)
            return null;
        (0, ProtocolValidation_1.validateSessionResponse)(res);
        return res;
    }
    async addMixLayer(guildId, data) {
        this.node.assertFeature("mix:add");
        (0, NodeLinkOrchestration_1.requireGuildId)(guildId);
        const body = (0, NodeLinkMixContracts_1.mixCreateBody)(data);
        const res = await this.featureRequest("mix:add", { guildId }, {
            headers: this.jsonHeaders,
            body
        }, NodeLinkMixContracts_1.validateMixCreated);
        return res == null ? null : res;
    }
    async getMixLayers(guildId) {
        this.node.assertFeature("mix:list");
        (0, NodeLinkOrchestration_1.requireGuildId)(guildId);
        const res = await this.featureRequest("mix:list", { guildId }, {
            headers: this.authHeaders
        }, NodeLinkMixContracts_1.validateMixLayers);
        return res == null ? null : res;
    }
    async updateMixLayerVolume(guildId, mixId, volume) {
        this.node.assertFeature("mix:update");
        (0, NodeLinkOrchestration_1.requireGuildId)(guildId);
        (0, NodeLinkMixContracts_1.requireMixId)(mixId);
        (0, NodeLinkMixContracts_1.requireMixVolume)(volume);
        await this.featureRequest("mix:update", { guildId, mixId }, {
            headers: this.jsonHeaders,
            body: { volume }
        });
    }
    async removeMixLayer(guildId, mixId) {
        this.node.assertFeature("mix:remove");
        (0, NodeLinkOrchestration_1.requireGuildId)(guildId);
        (0, NodeLinkMixContracts_1.requireMixId)(mixId);
        await this.featureRequest("mix:remove", { guildId, mixId }, {
            headers: this.authHeaders
        });
    }
    async getLavaLyrics(encodedTrack, options) {
        const params = (0, LavaLyricsContracts_1.lavaLyricsParameters)(encodedTrack, options);
        const backend = this.node.backend;
        if (backend?.kind !== 'lavalink' || !(0, LavaLyricsContracts_1.hasLavaLyricsPlugin)(backend.plugins) ||
            backend.featureStatus('lavalyrics') === 'unavailable') {
            throw new FeatureUnavailableError_1.FeatureUnavailableError('lavalyrics', backend?.kind ?? 'unknown');
        }
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        const result = await this.node.circuit.run(async () => {
            try {
                return await this.request(this.url + '/v4/lyrics?' + params.toString(), {
                    method: 'GET', headers: this.authHeaders, throwOnError: true,
                    noContentAsNull: true
                }, 10000, 0);
            }
            catch (error) {
                this.featureError('lavalyrics', error, backend, current);
            }
        });
        if (result === null) {
            if (current())
                backend.recordFeature('lavalyrics', 'available');
            return null;
        }
        (0, LavaLyricsContracts_1.validateLavaLyrics)(result);
        if (current())
            backend.recordFeature('lavalyrics', 'available');
        return result;
    }
    async loadLyrics(encodedTrack, options) {
        this.node.assertFeature("lyrics");
        const params = (0, NodeLinkContracts_1.lyricsParameters)(encodedTrack, options);
        const res = await this.featureRequest("lyrics", { query: params }, {
            headers: this.authHeaders
        });
        return res ? (0, Util_1.normalizeNodeLinkResponse)(res, res.loadType) : null;
    }
    async getSourceHealth() {
        return this.featureRequest('source-health', {}, { headers: this.authHeaders }, NodeLinkContracts_1.validateSourceHealth);
    }
    async loadChapters(encodedTrack) {
        this.node.assertFeature("chapters");
        const params = new URLSearchParams();
        params.append("encodedTrack", encodedTrack);
        const res = await this.featureRequest("chapters", { query: params }, {
            headers: this.authHeaders
        });
        return res ? (0, Util_1.normalizeNodeLinkResponse)(res, "chapters") : null;
    }
    async loadMeaning(encodedTrack, lang) {
        this.node.assertFeature("meaning");
        const params = new URLSearchParams();
        params.append("encodedTrack", encodedTrack);
        if (lang)
            params.append("lang", lang);
        const res = await this.featureRequest("meaning", { query: params }, {
            headers: this.authHeaders
        });
        return res ? (0, Util_1.normalizeNodeLinkResponse)(res, res.loadType) : null;
    }
    async getConnectionStatus() {
        this.node.assertFeature("connection");
        const res = await this.featureRequest("connection", {}, {
            headers: this.authHeaders
        });
        return res ? (0, Util_1.normalizeNodeLinkResponse)(res, "connection") : null;
    }
    async getMetrics() {
        this.node.assertFeature("metrics");
        const res = await this.featureRequest("metrics", {}, {
            headers: this.authHeaders
        });
        return res || null;
    }
    async getWorkers() {
        this.node.assertFeature("workers:get");
        const res = await this.featureRequest("workers:get", {}, {
            headers: this.authHeaders
        });
        return res ? (0, Util_1.normalizeNodeLinkResponse)(res, "workers") : null;
    }
    async patchWorker(payload) {
        this.node.assertFeature("workers:patch");
        const res = await this.featureRequest("workers:patch", {}, {
            headers: this.jsonHeaders,
            body: payload
        });
        return res || null;
    }
    async getYoutubeConfig(validate = false) {
        this.node.assertFeature("youtube:config");
        const params = new URLSearchParams();
        if (validate)
            params.append("validate", "true");
        const res = await this.featureRequest("youtube:config:get", { query: params }, {
            headers: this.authHeaders
        });
        return res || null;
    }
    async updateYoutubeConfig(payload) {
        this.node.assertFeature("youtube:config");
        const res = await this.featureRequest("youtube:config:update", {}, {
            headers: this.jsonHeaders,
            body: payload
        });
        return res || null;
    }
    async exchangeYoutubeOAuth(refreshToken) {
        this.node.assertFeature("youtube:oauth");
        const params = new URLSearchParams();
        params.append("refreshToken", refreshToken);
        const res = await this.featureRequest("youtube:oauth", { query: params }, {
            headers: this.authHeaders
        });
        return res || null;
    }
    async encodeTrackRemote(track) {
        this.node.assertFeature("encodetrack");
        const params = new URLSearchParams();
        params.append("track", track);
        const res = await this.featureRequest("encodetrack", { query: params }, {
            headers: this.authHeaders
        });
        return res || null;
    }
    async encodeTracksRemote(tracks) {
        this.node.assertFeature("encodedtracks");
        const res = await this.featureRequest("encodedtracks", {}, {
            headers: this.jsonHeaders,
            body: tracks
        });
        return res || null;
    }
    async trackStream(encodedTrack, itag) {
        this.node.assertFeature("trackstream");
        const params = new URLSearchParams();
        params.append("encodedTrack", encodedTrack);
        if (itag !== undefined && itag !== null) {
            params.append("itag", String(itag));
        }
        const res = await this.featureRequest("trackstream", { query: params }, {
            headers: this.authHeaders
        });
        return res || null;
    }
    async getStreamFormats(encodedTrack, options = {}) {
        this.node.assertFeature('loadstream');
        if (typeof encodedTrack !== 'string' || !encodedTrack.trim())
            throw new TypeError('Stream formats require an encoded track');
        if (options.itag !== undefined && (!Number.isSafeInteger(options.itag) || options.itag <= 0))
            throw new TypeError('itag must be a positive integer');
        if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30000))
            throw new RangeError('Invalid stream formats timeout');
        const route = this.extensionRoute('loadstream');
        const backend = this.node.backend;
        const socket = this.node.socket;
        const session = this.node.sessionId;
        const current = () => !this.node.destroyed && this.node.backend === backend &&
            this.node.socket === socket && this.node.sessionId === session;
        try {
            const response = await this.request(this.url + route.path, {
                method: route.method, headers: this.jsonHeaders,
                body: { encodedTrack, format: 'formats', ...(options.itag !== undefined ? { itag: options.itag } : {}) },
                signal: options.signal, throwOnError: true,
            }, options.timeoutMs ?? 10000, 0);
            (0, NodeLinkContracts_1.validateNodeLinkStreamFormats)(response);
            if (current())
                backend?.recordFeature('loadstream', 'available');
            return response;
        }
        catch (error) {
            this.featureError('loadstream', error, backend, current);
        }
    }
    async loadStream(payload, options = {}) {
        this.node.assertFeature('loadstream');
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
            if (payload.format !== undefined && !['raw', 'pcm'].includes(payload.format))
                throw new TypeError('Client PCM seeking supports raw/pcm only; original bytes cannot be trimmed as PCM');
            (0, ClientPCMSeek_1.assertClientPcmSeekPosition)(payload.position ?? 0);
        }
        const requestPayload = clientTrim
            ? { ...payload, position: 0, format: 'raw' }
            : payload.format === 'pcm' ? { ...payload, format: 'raw' }
                : passthrough ? { ...payload, format: 'passthrough' } : payload;
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
            try {
                (0, NodeLinkStreamResponse_1.validateNodeLinkStreamResponse)(res.headers, passthrough ? 'passthrough' :
                    requestPayload.format === 'wav' ? 'wav' : 'raw');
            }
            catch (error) {
                res.stream.destroy();
                throw error;
            }
            if (current())
                backend?.recordFeature('loadstream', 'available');
            if (!clientTrim)
                return { stream: res.stream, headers: res.headers, statusCode: res.statusCode };
            const headers = { ...res.headers };
            delete headers['content-length'];
            delete headers['content-range'];
            delete headers['transfer-encoding'];
            delete headers['accept-ranges'];
            return {
                stream: (0, ClientPCMSeek_1.createClientPcmSeekStream)(res.stream, payload.position ?? 0),
                headers, statusCode: res.statusCode,
            };
        }
        catch (error) {
            this.featureError('loadstream', error, backend, current);
        }
    }
    async subscribeLyrics(guildId, skipTrackSource) {
        this.node.assertFeature("lyrics:subscribe");
        const params = new URLSearchParams();
        if (skipTrackSource)
            params.append("skipTrackSource", "true");
        await this.featureRequest("lyrics:subscribe", { guildId, query: params }, {
            headers: this.authHeaders
        });
    }
    async unsubscribeLyrics(guildId) {
        this.node.assertFeature("lyrics:unsubscribe");
        await this.featureRequest("lyrics:unsubscribe", { guildId }, {
            headers: this.authHeaders
        });
    }
}
exports.Rest = Rest;
//# sourceMappingURL=Rest.js.map