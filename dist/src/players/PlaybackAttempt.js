"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaybackAttempt = void 0;
exports.playbackAttempt = playbackAttempt;
const node_crypto_1 = require("node:crypto");
const node_util_1 = require("node:util");
const PlaybackGuard_1 = require("./PlaybackGuard");
const markerKey = '__nyxlinkPlaybackAttempt';
function marker(track) {
    const value = track.userData?.[markerKey];
    return value && value.version === 1 && typeof value.id === 'string' && typeof value.hadValue === 'boolean' ? value : undefined;
}
function cleanPlaybackTrack(track) {
    const identity = marker(track);
    if (!identity)
        return track;
    const data = { ...track.userData };
    if (identity.hadValue)
        data[markerKey] = identity.value;
    else
        delete data[markerKey];
    return { ...track, userData: data };
}
class PlaybackAttempt {
    player;
    current;
    preloaded;
    constructor(player) {
        this.player = player;
    }
    create(node, encoded) {
        return {
            id: (0, node_crypto_1.randomUUID)(), encoded, node, ticket: (0, PlaybackGuard_1.playbackGuard)(this.player).ticket,
            started: false, ended: false, wire: true,
            waitForStart: this.current?.ended === true && this.current.encoded === encoded,
        };
    }
    decorate(track, attempt) {
        const data = track.userData ?? {};
        const identity = { version: 1, id: attempt.id, hadValue: Object.hasOwn(data, markerKey) };
        if (identity.hadValue)
            identity.value = data[markerKey];
        return { ...track, userData: { ...data, [markerKey]: identity } };
    }
    begin(node, track) {
        const previous = this.current;
        const previousPreload = this.preloaded;
        const attempt = this.create(node, track.encoded);
        this.current = attempt;
        return {
            track: this.decorate(track, attempt),
            accepted: (response) => {
                const echoed = response?.track;
                const identity = echoed && marker(echoed);
                return !echoed || echoed.encoded === attempt.encoded && (!identity || identity.id === attempt.id);
            },
            rollback: () => {
                if (this.current === attempt && !attempt.started) {
                    this.current = previous;
                    if ((0, PlaybackGuard_1.playbackGuard)(this.player).isCurrent(attempt.ticket)) {
                        if (previous)
                            previous.ticket = attempt.ticket;
                        if (previousPreload && this.preloaded === previousPreload && previousPreload.node === this.player.node)
                            previousPreload.ticket = attempt.ticket;
                    }
                }
            },
        };
    }
    preload(node, track) {
        const previous = this.preloaded;
        const ticket = (0, PlaybackGuard_1.playbackGuard)(this.player).ticket;
        const attempt = track ? this.create(node, track.encoded) : undefined;
        this.preloaded = attempt;
        return {
            track: track ? this.decorate(track, attempt) : null,
            rollback: () => {
                if (this.preloaded === attempt) {
                    this.preloaded = previous;
                    if (previous && previous.node === this.player.node && (0, PlaybackGuard_1.playbackGuard)(this.player).isCurrent(ticket))
                        previous.ticket = ticket;
                }
            },
        };
    }
    active(node, track) {
        if (this.player.destroyed || this.player.node !== node || !track.encoded)
            return undefined;
        const ticket = (0, PlaybackGuard_1.playbackGuard)(this.player).ticket;
        if (!this.current) {
            if (this.player.current?.encoded !== track.encoded)
                return undefined;
            this.current = this.create(node, track.encoded);
            const identity = marker(track);
            const data = this.player.current.userData ?? {};
            this.current.wire = !!identity && identity.hadValue === Object.hasOwn(data, markerKey) &&
                (!identity.hadValue || (0, node_util_1.isDeepStrictEqual)(identity.value, data[markerKey]));
            if (this.current.wire)
                this.current.id = identity.id;
        }
        const attempt = this.current;
        const identity = attempt.wire ? marker(track) : undefined;
        if (attempt.node !== node || attempt.ticket !== ticket || attempt.encoded !== track.encoded || identity && identity.id !== attempt.id)
            return undefined;
        return attempt;
    }
    start(node, track) {
        const pending = this.preloaded;
        const identity = marker(track);
        if (pending && pending.node === node && pending.ticket === (0, PlaybackGuard_1.playbackGuard)(this.player).ticket &&
            this.player.node === node && !this.player.destroyed && pending.encoded === track.encoded &&
            (identity ? identity.id === pending.id : this.player.current?.encoded !== track.encoded)) {
            this.current = pending;
            this.preloaded = undefined;
            pending.started = true;
            return 'preloaded';
        }
        const attempt = this.active(node, track);
        if (!attempt || attempt.ended || attempt.started)
            return false;
        attempt.started = true;
        return 'current';
    }
    end(node, track) {
        const attempt = this.active(node, track);
        if (!attempt || attempt.ended || (!attempt.wire || !marker(track)) && attempt.waitForStart && !attempt.started)
            return false;
        attempt.ended = true;
        return true;
    }
    accepts(node, track) {
        const attempt = this.active(node, track);
        return !!attempt && !attempt.ended;
    }
    retain(ticket) {
        if (this.player.destroyed || !(0, PlaybackGuard_1.playbackGuard)(this.player).isCurrent(ticket))
            return;
        if (this.current?.node === this.player.node)
            this.current.ticket = ticket;
        if (this.preloaded?.node === this.player.node)
            this.preloaded.ticket = ticket;
    }
    clean(track) {
        return this.current?.wire ? cleanPlaybackTrack(track) : track;
    }
}
exports.PlaybackAttempt = PlaybackAttempt;
const attempts = new WeakMap();
function playbackAttempt(player) {
    let attempt = attempts.get(player);
    if (!attempt) {
        attempt = new PlaybackAttempt(player);
        attempts.set(player, attempt);
    }
    return attempt;
}
//# sourceMappingURL=PlaybackAttempt.js.map