"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Track = void 0;
const Util_1 = require("../Util");
class Track {
    encoded;
    title;
    author;
    duration;
    identifier;
    isSeekable;
    isStream;
    uri;
    artworkUrl;
    isrc;
    sourceName;
    position;
    time;
    requester;
    origin;
    backend;
    pluginInfo;
    userData;
    retries = 0;
    isPartial = false;
    #partialTrackOptions;
    #originalInfo;
    constructor(data, requester, origin, partialTrackOptions = Util_1.Structure.getManager()?.options?.trackPartial ?? []) {
        this.#partialTrackOptions = Array.isArray(partialTrackOptions) ? [...partialTrackOptions] : [];
        const normalized = this.normalizeTrackData(data);
        this.encoded = normalized.encoded;
        this.#originalInfo = { ...normalized.info };
        this.title = normalized.info.title;
        this.author = normalized.info.author;
        this.requester = requester || normalized.userData?.requester;
        this.origin = origin;
        if (data.backend === 'lavalink' || data.backend === 'nodelink')
            this.backend = data.backend;
        this.pluginInfo = normalized.pluginInfo ?? {};
        this.userData = normalized.userData ?? {};
        const trackProps = this.createPropertySetters(normalized.info);
        if (this.#partialTrackOptions.length > 0) {
            this.isPartial = true;
            trackProps.title();
            trackProps.author();
            this.#partialTrackOptions.forEach(prop => {
                if (prop in trackProps) {
                    trackProps[prop]();
                }
            });
        }
        else {
            Object.values(trackProps).forEach(setter => setter());
        }
        if (this.requester) {
            if (!this.userData)
                this.userData = {};
            this.userData.requester = this.requester;
        }
        Object.keys(this).forEach(key => {
            if (this[key] === undefined) {
                delete this[key];
            }
        });
    }
    normalizeTrackData(data) {
        if (data && typeof data === "object" && "info" in data && data.info) {
            const withInfo = data;
            return {
                encoded: withInfo.encoded,
                info: withInfo.info,
                pluginInfo: withInfo.pluginInfo ?? {},
                userData: withInfo.userData ?? {},
            };
        }
        const flat = data;
        return {
            encoded: flat.encoded,
            info: {
                title: flat.title,
                author: flat.author,
                length: flat.duration ?? flat.length,
                identifier: flat.identifier,
                isSeekable: flat.isSeekable,
                isStream: flat.isStream,
                uri: flat.uri ?? null,
                artworkUrl: flat.artworkUrl ?? null,
                isrc: flat.isrc ?? null,
                sourceName: flat.sourceName,
                position: flat.position ?? 0,
            },
            pluginInfo: flat.pluginInfo ?? {},
            userData: flat.userData ?? {},
        };
    }
    createPropertySetters(info) {
        return {
            title: () => (this.title = info.title),
            author: () => (this.author = info.author),
            duration: () => (this.duration = info.length),
            identifier: () => (this.identifier = info.identifier),
            isSeekable: () => (this.isSeekable = info.isSeekable),
            isStream: () => (this.isStream = info.isStream),
            uri: () => (this.uri = info.uri),
            artworkUrl: () => (this.artworkUrl = info.artworkUrl || null),
            isrc: () => (this.isrc = info.isrc || null),
            sourceName: () => (this.sourceName = info.sourceName),
            position: () => (this.position = info.position || 0),
            time: () => (this.time = 0)
        };
    }
    isPartialTrack() {
        return this.isPartial;
    }
    get thumbnail() {
        if (this.artworkUrl)
            return this.artworkUrl;
        const info = this.getInfo();
        if (info.artworkUrl)
            return info.artworkUrl;
        if (info.sourceName === "youtube" && info.identifier) {
            return `https://img.youtube.com/vi/${info.identifier}/mqdefault.jpg`;
        }
        return null;
    }
    setRequester(requester) {
        this.requester = requester;
        if (this.requester) {
            if (!this.userData)
                this.userData = {};
            this.userData.requester = this.requester;
        }
        return this;
    }
    setPosition(position) {
        this.position = position;
        return this;
    }
    clone() {
        const record = this.toJSON();
        const userData = JSON.parse(JSON.stringify(this.userData));
        const pluginInfo = JSON.parse(JSON.stringify(this.pluginInfo));
        const newTrack = new (Util_1.Structure.get("Track"))({ ...record, userData, pluginInfo }, this.requester, this.origin, this.#partialTrackOptions);
        newTrack.retries = this.retries;
        return newTrack;
    }
    getInfo() {
        const original = this.#originalInfo;
        return {
            title: this.title,
            author: this.author,
            length: this.duration ?? original.length,
            identifier: this.identifier ?? original.identifier,
            isSeekable: this.isSeekable ?? original.isSeekable,
            isStream: this.isStream ?? original.isStream,
            uri: this.uri === undefined ? original.uri : this.uri,
            artworkUrl: this.artworkUrl === undefined ? original.artworkUrl ?? null : this.artworkUrl,
            isrc: this.isrc === undefined ? original.isrc ?? null : this.isrc,
            sourceName: this.sourceName ?? original.sourceName,
            position: this.position ?? original.position ?? 0,
        };
    }
    toJSON() {
        return {
            encoded: this.encoded,
            info: this.getInfo(),
            pluginInfo: this.pluginInfo,
            userData: this.userData,
            backend: this.backend,
        };
    }
}
exports.Track = Track;
//# sourceMappingURL=Track.js.map