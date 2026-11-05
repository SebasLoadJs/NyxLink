import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';
import { playbackGuard } from './PlaybackGuard';

const markerKey = '__nyxlinkPlaybackAttempt';
type TrackData = { encoded?: string; userData?: Record<string, any> };
type Marker = { version: 1; id: string; hadValue: boolean; value?: unknown };
type Attempt = { id: string; encoded: string; node: Node; ticket: number; started: boolean; ended: boolean; waitForStart: boolean; wire: boolean; restoring?: boolean };

function marker(track: TrackData): Marker | undefined {
    const value = track.userData?.[markerKey];
    return value && value.version === 1 && typeof value.id === 'string' && typeof value.hadValue === 'boolean' ? value : undefined;
}

function cleanPlaybackTrack<T extends TrackData>(track: T): T {
    const identity = marker(track);
    if (!identity) return track;
    const data = { ...track.userData };
    if (identity.hadValue) data[markerKey] = identity.value;
    else delete data[markerKey];
    return { ...track, userData: data };
}

/** Tracks wire attempts independently of encodings and user command generations. */
export class PlaybackAttempt {
    private current?: Attempt;
    private preloaded?: Attempt;

    constructor(private readonly player: Player) {}

    private create(node: Node, encoded: string): Attempt {
        return {
            id: randomUUID(), encoded, node, ticket: playbackGuard(this.player).ticket,
            started: false, ended: false, wire: true,
            waitForStart: this.current?.ended === true && this.current.encoded === encoded,
        };
    }

    private decorate<T extends TrackData>(track: T, attempt: Attempt): T {
        const data = track.userData ?? {};
        const identity: Marker = { version: 1, id: attempt.id, hadValue: Object.hasOwn(data, markerKey) };
        if (identity.hadValue) identity.value = data[markerKey];
        return { ...track, userData: { ...data, [markerKey]: identity } };
    }

    public begin<T extends TrackData>(node: Node, track: T, restoring = false) {
        const previous = this.current;
        const previousPreload = this.preloaded;
        const attempt = this.create(node, track.encoded!);
        attempt.restoring = restoring;
        this.current = attempt;
        return {
            track: this.decorate(track, attempt),
            accepted: (response: any) => {
                const echoed = response?.track;
                const identity = echoed && marker(echoed);
                return !echoed || echoed.encoded === attempt.encoded && (!identity || identity.id === attempt.id);
            },
            rollback: () => {
                if (this.current === attempt && !attempt.started) {
                    this.current = previous;
                    if (playbackGuard(this.player).isCurrent(attempt.ticket)) {
                        if (previous) previous.ticket = attempt.ticket;
                        if (previousPreload && this.preloaded === previousPreload && previousPreload.node === this.player.node) previousPreload.ticket = attempt.ticket;
                    }
                }
            },
        };
    }

    public preload<T extends TrackData>(node: Node, track: T | null) {
        const previous = this.preloaded;
        const ticket = playbackGuard(this.player).ticket;
        const attempt = track ? this.create(node, track.encoded!) : undefined;
        this.preloaded = attempt;
        return {
            track: track ? this.decorate(track, attempt!) : null,
            rollback: () => {
                if (this.preloaded === attempt) {
                    this.preloaded = previous;
                    if (previous && previous.node === this.player.node && playbackGuard(this.player).isCurrent(ticket)) previous.ticket = ticket;
                }
            },
        };
    }

    private active(node: Node, track: TrackData): Attempt | undefined {
        if (this.player.destroyed || this.player.node !== node || !track.encoded) return undefined;
        const ticket = playbackGuard(this.player).ticket;
        if (!this.current) {
            if (this.player.current?.encoded !== track.encoded) return undefined;
            this.current = this.create(node, track.encoded);
            const identity = marker(track);
            const data = this.player.current.userData ?? {};
            this.current.wire = !!identity && identity.hadValue === Object.hasOwn(data, markerKey) &&
                (!identity.hadValue || isDeepStrictEqual(identity.value, data[markerKey]));
            if (this.current.wire) this.current.id = identity!.id;
        }
        const attempt = this.current;
        const identity = attempt.wire ? marker(track) : undefined;
        if (attempt.node !== node || attempt.ticket !== ticket || attempt.encoded !== track.encoded || identity && identity.id !== attempt.id) return undefined;
        return attempt;
    }

    public start(node: Node, track: TrackData): 'current' | 'preloaded' | false {
        const pending = this.preloaded;
        const identity = marker(track);
        if (pending && pending.node === node && pending.ticket === playbackGuard(this.player).ticket &&
            this.player.node === node && !this.player.destroyed && pending.encoded === track.encoded &&
            (identity ? identity.id === pending.id : this.player.current?.encoded !== track.encoded)) {
            this.current = pending;
            this.preloaded = undefined;
            pending.started = true;
            return 'preloaded';
        }
        const attempt = this.active(node, track);
        if (!attempt || attempt.ended || attempt.started) return false;
        attempt.started = true;
        return 'current';
    }

    public end(node: Node, track: TrackData): boolean {
        const attempt = this.active(node, track);
        if (!attempt || attempt.ended || (!attempt.wire || !marker(track)) && attempt.waitForStart && !attempt.started) return false;
        attempt.ended = true;
        return true;
    }

    public accepts(node: Node, track: TrackData): boolean {
        const attempt = this.active(node, track);
        return !!attempt && !attempt.ended;
    }

    /** Restoration starts retain local pause/seek intent, including later confirmed controls. */
    public isRestoring(): boolean {
        return this.current?.restoring === true;
    }

    public retain(ticket: number): void {
        if (this.player.destroyed || !playbackGuard(this.player).isCurrent(ticket)) return;
        if (this.current?.node === this.player.node) this.current.ticket = ticket;
        if (this.preloaded?.node === this.player.node) this.preloaded.ticket = ticket;
    }

    /** A rejected migration may have received a start before its HTTP acknowledgement failed. */
    public checkpoint(): (ticket: number) => void {
        const current = this.current ? { ...this.current } : undefined;
        const preloaded = this.preloaded ? { ...this.preloaded } : undefined;
        return ticket => {
            this.current = current ? { ...current } : undefined;
            this.preloaded = preloaded ? { ...preloaded } : undefined;
            this.retain(ticket);
        };
    }

    /** Public tracks retain caller metadata; transport identities never enter snapshots. */
    public clean<T extends TrackData>(track: T): T {
        return this.current?.wire ? cleanPlaybackTrack(track) : track;
    }
}

const attempts = new WeakMap<Player, PlaybackAttempt>();
export function playbackAttempt(player: Player): PlaybackAttempt {
    let attempt = attempts.get(player);
    if (!attempt) { attempt = new PlaybackAttempt(player); attempts.set(player, attempt); }
    return attempt;
}
