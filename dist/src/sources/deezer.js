"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeezerSource = void 0;
const node_https_1 = __importDefault(require("node:https"));
const node_url_1 = require("node:url");
const Util_1 = require("../Util");
const RequestPolicy_1 = require("../http/RequestPolicy");
const HttpPolicyError_1 = require("../errors/HttpPolicyError");
class DeezerSource {
    name = "Deezer";
    manager;
    constructor(manager) {
        this.manager = manager;
        this.manager.options.deezer = this.manager.options?.deezer ?? {};
        this.manager.emit("debug", "Moonlink.js > Deezer > Source loaded");
    }
    get options() {
        return this.manager.options.deezer ?? {};
    }
    match(query) {
        const shortLink = /^(?:https?:\/\/)?dzr\.page\.link\/[\w-]+$/;
        return (query.startsWith("dzsearch:") ||
            /(?:https?:\/\/)?(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist|artist)\/\d+/.test(query) ||
            shortLink.test(query));
    }
    async resolveShortLink(url, signal) {
        let current = url.startsWith("http") ? url : `https://${url}`;
        const seen = new Set();
        for (let i = 0; i <= 5; i++) {
            signal?.throwIfAborted();
            const target = (0, RequestPolicy_1.requestUrl)(current, ["https://dzr.page.link", "https://deezer.com", "https://www.deezer.com"]);
            if (seen.has(target.href))
                throw new HttpPolicyError_1.HttpPolicyError('redirect-limit');
            seen.add(target.href);
            const next = await new Promise((resolve, reject) => {
                const req = node_https_1.default.request({
                    method: "GET", signal: (0, RequestPolicy_1.providerSignal)(signal),
                    hostname: target.hostname,
                    port: target.port || (target.protocol === "https:" ? 443 : 80),
                    path: target.pathname + target.search,
                    headers: { "User-Agent": "Moonlink.js" },
                }, (res) => {
                    const statusCode = res.statusCode ?? 0;
                    const location = res.headers.location;
                    res.destroy();
                    if (statusCode >= 300 && statusCode < 400 && location) {
                        try {
                            resolve({ url: (0, RequestPolicy_1.requestUrl)(location, ["https://dzr.page.link", "https://deezer.com", "https://www.deezer.com"], current).href, redirected: true });
                        }
                        catch (error) {
                            reject(error);
                        }
                        return;
                    }
                    resolve({ url: current, redirected: false });
                });
                req.on("error", reject);
                req.setTimeout(10000, () => req.destroy(Object.assign(new Error("Provider request timed out"), { code: "ETIMEDOUT" })));
                req.end();
            }).catch((error) => {
                if (error instanceof HttpPolicyError_1.HttpPolicyError || signal?.aborted || error.code === 'ETIMEDOUT')
                    throw error;
                this.manager.emit("debug", `Moonlink.js > Deezer > Short link resolve failed: ${error.message}`);
                return null;
            });
            if (!next)
                return null;
            if (!next.redirected)
                return current;
            current = next.url;
        }
        throw new HttpPolicyError_1.HttpPolicyError("redirect-limit");
    }
    async apiRequest(path, signal) {
        const url = (0, RequestPolicy_1.providerUrl)(path, "https://api.deezer.com");
        const res = await (0, Util_1.makeRequest)(url, { method: "GET", signal: (0, RequestPolicy_1.providerSignal)(signal), allowedOrigins: ["https://api.deezer.com"], throwOnError: true }, 10000, 0);
        if (!res) {
            this.manager.emit("debug", "Moonlink.js > Deezer > API request failed.");
            return null;
        }
        return res;
    }
    async search(query, options) {
        const q = query.startsWith("dzsearch:") ? query.slice(9).trim() : query;
        const limit = options?.limit ?? this.options.maxSearchResults ?? 20;
        const params = new node_url_1.URLSearchParams({ q, limit: String(limit) });
        const data = await this.apiRequest(`/search?${params}`, options?.signal);
        if (!data?.data?.length)
            return { loadType: "empty", data: {} };
        const tracks = data.data.map((t) => this.buildTrack(t));
        return { loadType: "search", data: tracks };
    }
    async load(query, options) {
        const shortLink = /^(?:https?:\/\/)?dzr\.page\.link\/[\w-]+$/;
        if (shortLink.test(query)) {
            const resolved = await this.resolveShortLink(query, options?.signal);
            if (resolved)
                query = resolved;
        }
        const m = /(?:https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist|artist)\/(\d+))/.exec(query);
        if (!m)
            return { loadType: "error", data: { message: "Invalid Deezer URL" } };
        const [, type, id] = m;
        if (type === "track") {
            const data = await this.apiRequest(`/track/${id}`, options?.signal);
            if (!data)
                return { loadType: "error", data: { message: "Track not found." } };
            return { loadType: "track", data: this.buildTrack(data) };
        }
        if (type === "artist") {
            const artist = await this.apiRequest(`/artist/${id}`, options?.signal);
            const limit = options?.limit ?? this.options.maxArtistTracks ?? 20;
            const top = await this.apiRequest(`/artist/${id}/top?limit=${limit}`, options?.signal);
            if (!artist || !top?.data) {
                return { loadType: "error", data: { message: "Artist not found." } };
            }
            const tracks = top.data.map((t) => this.buildTrack(t));
            return {
                loadType: "playlist",
                data: { info: { name: artist.name, selectedTrack: 0 }, tracks },
            };
        }
        const path = type === "album" ? `/album/${id}` : `/playlist/${id}`;
        const col = await this.apiRequest(path, options?.signal);
        if (!col?.tracks?.data) {
            return { loadType: "error", data: { message: `${type} not found.` } };
        }
        const items = col.tracks.data;
        const limitKey = type === "album" ? "maxAlbumTracks" : "maxPlaylistTracks";
        const limit = options?.limit ??
            this.options[limitKey] ??
            this.manager.options.search?.playlistLoadLimit;
        const slice = typeof limit === "number" ? items.slice(0, limit) : items;
        const tracks = slice.map((t) => this.buildTrack(t));
        return { loadType: "playlist", data: { info: { name: col.title, selectedTrack: 0 }, tracks } };
    }
    buildTrack(item) {
        const info = {
            identifier: String(item.id),
            uri: item.link,
            title: item.title,
            author: item.artist?.name ?? "Unknown",
            length: (item.duration ?? item.track?.duration ?? 0) * 1000,
            isSeekable: true,
            isStream: false,
            isrc: item.isrc ?? null,
            artworkUrl: item.album?.cover_xl || item.album?.cover_big || null,
            sourceName: "deezer",
            position: 0,
        };
        return {
            info,
            encoded: (0, Util_1.encodeTrack)(info),
            pluginInfo: { MoonlinkInternal: true, needsStream: true },
            userData: {},
        };
    }
    resolve(query) {
        return this.load(query);
    }
}
exports.DeezerSource = DeezerSource;
//# sourceMappingURL=deezer.js.map