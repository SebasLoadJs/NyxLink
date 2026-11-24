"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecommendationResolver = void 0;
const Track_1 = require("../entities/Track");
const PlaybackGuard_1 = require("../players/PlaybackGuard");
const requests = new WeakMap();
function trackInfo(track) {
    if (track instanceof Track_1.Track)
        return track.getInfo();
    const record = track;
    return record.info ?? record;
}
class RecommendationResolver {
    static async update(node, player, track) {
        const request = {};
        requests.set(player, request);
        const guard = (0, PlaybackGuard_1.playbackGuard)(player);
        const ticket = guard.ticket;
        if (guard.isCurrent(ticket) && !player.destroyed)
            player.recommendations = [];
        if (!track || player.destroyed)
            return;
        const info = trackInfo(track);
        if (typeof info.sourceName !== 'string' || !info.sourceName ||
            typeof info.identifier !== 'string' || !info.identifier)
            return;
        try {
            let uri = null;
            let searchSource = null;
            const source = info.sourceName.toLowerCase();
            const identifier = info.identifier;
            const validYouTubeId = /^[A-Za-z0-9_-]{11}$/.test(identifier);
            switch (source) {
                case "youtube":
                    if (!validYouTubeId)
                        return;
                    uri = `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`;
                    searchSource = "youtube";
                    break;
                case "youtubemusic":
                    if (!validYouTubeId)
                        return;
                    uri = `https://music.youtube.com/watch?v=${identifier}&list=RD${identifier}`;
                    searchSource = "youtubemusic";
                    break;
                case "spotify":
                    if (node.isNodeLink && node.capabilities.has("source:spotify") &&
                        /^[A-Za-z0-9]{22}$/.test(identifier)) {
                        uri = `seed_tracks=${identifier}`;
                        searchSource = "sprec";
                    }
                    break;
                case "deezer":
                    if (node.isNodeLink && node.capabilities.has("source:deezer")) {
                        uri = identifier;
                        searchSource = "dzrec";
                    }
                    break;
                case "soundcloud":
                    uri = `${track.author}`;
                    searchSource = "soundcloud";
                    break;
                case "applemusic":
                    if (node.isNodeLink && node.capabilities.has("source:applemusic")) {
                        uri = identifier;
                        searchSource = "amrec";
                    }
                    break;
            }
            if (!uri || !searchSource) {
                if (source !== "youtube") {
                    const res = await node.manager.search({
                        query: `${track.title} ${track.author}`,
                        node: node.identifier,
                        source: "youtube",
                    });
                    const seed = res?.loadType !== "error" && res?.tracks?.map(trackInfo).find(candidate => {
                        const source = typeof candidate.sourceName === 'string' ? candidate.sourceName.toLowerCase() : '';
                        return (source === 'youtube' || source === 'youtubemusic') &&
                            typeof candidate.identifier === 'string' && /^[A-Za-z0-9_-]{11}$/.test(candidate.identifier);
                    });
                    if (!seed)
                        return;
                    uri = `https://www.youtube.com/watch?v=${seed.identifier}&list=RD${seed.identifier}`;
                    searchSource = "youtube";
                }
                else {
                    return;
                }
            }
            if (!guard.isCurrent(ticket) || player.destroyed || requests.get(player) !== request)
                return;
            const res = await node.manager.search({
                node: node.identifier,
                query: uri,
                source: searchSource,
                requester: track.requester,
            });
            if (!res || !res.tracks || res.tracks.length === 0 || res.loadType === "error") {
                return;
            }
            const historyLimit = node.manager.options.queue?.historyLimit ?? player.historySize ?? 10;
            const recentHistory = Array.isArray(player.previous) ? player.previous.slice(-historyLimit) : [];
            const queuedTracks = Array.isArray(player.queue?.tracks) ? player.queue.tracks : [];
            const getTrackKey = (t) => {
                if (!t)
                    return null;
                const metadata = t instanceof Track_1.Track ? t.getInfo() : t.info ?? t;
                const id = t.identifier ?? metadata.identifier;
                const src = (t.sourceName ?? metadata.sourceName ?? "unknown").toLowerCase();
                if (id)
                    return `${src}:${id}`;
                return t.encoded || null;
            };
            const blockedKeys = new Set();
            const addBlocked = (t) => {
                const key = getTrackKey(t);
                if (key)
                    blockedKeys.add(key);
            };
            addBlocked(track);
            recentHistory.forEach(addBlocked);
            queuedTracks.forEach(addBlocked);
            const seenKeys = new Set();
            const candidates = res.tracks.filter((t) => {
                const key = getTrackKey(t);
                if (!key || blockedKeys.has(key) || seenKeys.has(key))
                    return false;
                seenKeys.add(key);
                return true;
            });
            if (guard.isCurrent(ticket) && !player.destroyed && requests.get(player) === request)
                player.recommendations = candidates;
        }
        catch (error) {
            node.manager.emit("debug", `NyxLink > RecommendationResolver > Lookup failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.RecommendationResolver = RecommendationResolver;
//# sourceMappingURL=RecommendationResolver.js.map