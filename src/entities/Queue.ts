import { Track } from "./Track";
import type { Manager } from "../core/Manager";
import type { Player } from "./Player";
import { TrackCodec } from '../tracks/TrackCodec';

export class Queue {
    private player: Player;
    private manager: Manager;
    public tracks: Track[] = [];

    constructor(player: Player) {
        this.player = player;
        this.manager = player.manager;
    }

    private _updateQueue(): void {
        this.player.updateData('queue', this.tracks.map(t => TrackCodec.serialize(t)));
        this.player.requestQueuePreload?.();
    }

    public get size(): number {
        return this.tracks.length;
    }

    public get first(): Track | undefined {
        return this.tracks[0];
    }

    public get last(): Track | undefined {
        return this.tracks[this.tracks.length - 1];
    }

    public get isEmpty(): boolean {
        return this.tracks.length === 0;
    }

    public get duration(): number {
        return this.tracks.reduce((acc, cur) => acc + Math.max(0, cur.getInfo().length), 0);
    }

    public get remainingDuration(): number {
        const queueDuration = this.duration;
        const currentTrackRemaining = this.player.current 
            ? Math.max(0, this.player.current.getInfo().length - this.player.current.getInfo().position) 
            : 0;
        return queueDuration + currentTrackRemaining;
    }

    public get all(): Track[] {
        return this.tracks;
    }

    public add(track: Track | Track[]): void {
        const tracksToAdd = Array.isArray(track) ? track : [track];
        const maxSize = this.manager.options.queue?.maxSize ?? 1000;
        const allowDuplicates = this.manager.options.queue?.allowDuplicates ?? true;

        let addedTracks: Track[] = [];

        for (const t of tracksToAdd) {
            if (t === undefined || t === null) continue;

            if (maxSize !== "unlimited" && this.tracks.length >= maxSize) {
                this.manager.emit("debug", `Moonlink.js > Queue >> Max queue size (${maxSize}) reached. Cannot add more tracks.`);
                break;
            }

            if (!allowDuplicates && this.tracks.some(existing => existing.encoded === t.encoded)) {
                this.manager.emit("debug", `Moonlink.js > Queue >> Duplicate track not allowed. Track: ${t.title}`);
                continue;
            }

            this.tracks.push(t);
            addedTracks.push(t);
        }

        if (addedTracks.length > 0) {
            this.manager.emit("queueAdd", this.player, addedTracks.length === 1 ? addedTracks[0] : addedTracks);
            this._updateQueue();
        }
    }

    public insert(index: number, track: Track | Track[]): void {
        if (!Number.isSafeInteger(index) || index < 0 || index > this.tracks.length) return;
        const tracksToAdd = (Array.isArray(track) ? track : [track]).filter(t => t != null);
        const allowDuplicates = this.manager.options.queue?.allowDuplicates ?? true;
        const seen = new Set(this.tracks.map(t => t.encoded));
        const accepted = allowDuplicates ? tracksToAdd : tracksToAdd.filter(t => {
            if (seen.has(t.encoded)) return false;
            seen.add(t.encoded);
            return true;
        });
        if (!accepted.length) return;
        const maxSize = this.manager.options.queue?.maxSize ?? 1000;

        if (maxSize !== "unlimited" && this.tracks.length + accepted.length > maxSize) {
            this.manager.emit("debug", `Moonlink.js > Queue >> Max queue size (${maxSize}) reached. Cannot insert more tracks.`);
            return;
        }

        this.tracks.splice(index, 0, ...accepted);
        this.manager.emit("queueAdd", this.player, accepted.length === 1 ? accepted[0] : accepted);
        this._updateQueue();
    }

    public get(position: number): Track | undefined {
        return this.tracks[position];
    }

    public has(track: Track): boolean {
        return this.tracks.includes(track);
    }

    public remove(index: number = 0): Track | undefined {
        if (!Number.isSafeInteger(index) || index < 0 || index >= this.tracks.length) return undefined;
        const removedTrack = this.tracks.splice(index, 1)[0];
        if (removedTrack) {
            this.manager.emit("queueRemove", this.player, removedTrack);
            this._updateQueue();
        }
        return removedTrack;
    }

    public shift(): Track | undefined {
        const track = this.tracks.shift();
        if (track) {
            this.manager.emit("queueRemove", this.player, track);
            this._updateQueue();
        }
        return track;
    }

    public unshift(track: Track): void {
        this.tracks.unshift(track);
        this.manager.emit("queueAdd", this.player, track);
        this._updateQueue();
    }

    public pop(): Track | undefined {
        const track = this.tracks.pop();
        if (track) {
            this.manager.emit("queueRemove", this.player, track);
            this._updateQueue();
        }
        return track;
    }

    public clear(): void {
        const oldQueue = [...this.tracks];
        this.tracks = [];
        this.manager.emit("queueRemove", this.player, oldQueue);
        this._updateQueue();
    }

    public shuffle(): void {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
        this._updateQueue();
    }

    public shuffleRange(start: number, end: number): void {
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end >= this.tracks.length || start >= end) return;
        
        const chunk = this.tracks.slice(start, end + 1);
        for (let i = chunk.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [chunk[i], chunk[j]] = [chunk[j], chunk[i]];
        }
        
        this.tracks.splice(start, chunk.length, ...chunk);
        this._updateQueue();
    }

    public removeDuplicates(): boolean {
        if (this.tracks.length < 2) return false;

        const uniqueTracks: Track[] = [];
        const seenEncoded: Set<string> = new Set();
        const removedTracks: Track[] = [];

        for (const track of this.tracks) {
            if (!seenEncoded.has(track.encoded)) {
                uniqueTracks.push(track);
                seenEncoded.add(track.encoded);
            } else {
                removedTracks.push(track);
            }
        }

        if (uniqueTracks.length === this.tracks.length) {
            return false;
        }

        this.tracks = uniqueTracks;
        if (removedTracks.length > 0) {
            this.manager.emit("queueRemove", this.player, removedTracks);
        }
        this._updateQueue();
        return true;
    }

    public sortByTitle(): void {
        if (this.tracks.length < 2) return;
        this.tracks.sort((a, b) => a.title.localeCompare(b.title));
        this._updateQueue();
    }

    public sortByAuthor(): void {
        if (this.tracks.length < 2) return;
        this.tracks.sort((a, b) => a.author.localeCompare(b.author));
        this._updateQueue();
    }

    public sortByDuration(): void {
        if (this.tracks.length < 2) return;
        this.tracks.sort((a, b) => a.getInfo().length - b.getInfo().length);
        this._updateQueue();
    }

    public find(query: string): Track | undefined {
        const searchTerm = query.toLowerCase();
        return this.tracks.find(t => 
            t.getInfo().identifier === query || 
            t.title.toLowerCase().includes(searchTerm)
        );
    }

    public move(from: number, to: number): boolean {
        if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < 0 || from >= this.tracks.length || to >= this.tracks.length) return false;
        
        const track = this.tracks.splice(from, 1)[0];
        this.tracks.splice(to, 0, track);
        this.manager.emit("queueMoveRange", this.player, [track], from, to);
        this._updateQueue();
        return true;
    }

    public moveRange(fromIndex: number, toIndex: number, count: number): boolean {
        if (!Number.isSafeInteger(fromIndex) || !Number.isSafeInteger(toIndex) || !Number.isSafeInteger(count) ||
            fromIndex < 0 || fromIndex >= this.tracks.length ||
            toIndex < 0 || toIndex > this.tracks.length ||
            count <= 0 || fromIndex + count > this.tracks.length) {
            return false;
        }

        const tracksToMove = this.tracks.splice(fromIndex, count);
        this.tracks.splice(toIndex, 0, ...tracksToMove);
        this.manager.emit("queueMoveRange", this.player, tracksToMove, fromIndex, toIndex);
        this._updateQueue();
        return true;
    }

    public removeRange(startIndex: number, endIndex: number): boolean {
        if (!Number.isSafeInteger(startIndex) || !Number.isSafeInteger(endIndex) || startIndex < 0 || startIndex >= this.tracks.length ||
            endIndex < startIndex || endIndex >= this.tracks.length) {
            return false;
        }

        const removed = this.tracks.splice(startIndex, endIndex - startIndex + 1);
        this.manager.emit("queueRemoveRange", this.player, removed, startIndex, endIndex);
        this._updateQueue();
        return true;
    }

    public duplicate(index: number, count: number = 1): boolean {
        if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index < 0 || index >= this.tracks.length || count <= 0) {
            return false;
        }

        const maxSize = this.manager.options.queue?.maxSize ?? 1000;
        // Bound a single duplication request even when the queue has unlimited capacity.
        if (this.manager.options.queue?.allowDuplicates === false ||
            (maxSize !== "unlimited" && count > maxSize - this.tracks.length) || count > 100_000) return false;
        const trackToDuplicate = this.tracks[index];
        // A queue item represents one playback attempt. Reusing the same Track
        // instance would share mutable position, retry state and user metadata
        // across separate plays of the same recording.
        const duplicatedTracks: Track[] = [];
        try {
            for (let i = 0; i < count; i++) {
                duplicatedTracks.push(trackToDuplicate.clone());
            }
        } catch {
            // Malformed or unserializable track metadata must not leave a
            // partially duplicated queue or emit a misleading queue event.
            return false;
        }

        // Avoid the engine argument limit for large, explicitly unlimited queues.
        this.tracks = this.tracks.slice(0, index + 1).concat(duplicatedTracks, this.tracks.slice(index + 1));
        this.manager.emit("queueDuplicate", this.player, duplicatedTracks, index);
        this._updateQueue();
        return true;
    }

    public jump(index: number): boolean {
        if (!Number.isSafeInteger(index) || index < 0 || index >= this.tracks.length) return false;
        if (index === 0) return true;

        const removed = this.tracks.splice(0, index);
        this.manager.emit("queueRemoveRange", this.player, removed, 0, index - 1);
        this._updateQueue();
        return true;
    }

    public slice(start: number, end?: number): Track[] {
        return this.tracks.slice(start, end);
    }

    public filter(predicate: (track: Track) => boolean): Track[] {
        return this.tracks.filter(predicate);
    }

    public reverse(): void {
        this.tracks.reverse();
        this._updateQueue();
    }

    public [Symbol.iterator](): Iterator<Track> {
        return this.tracks[Symbol.iterator]();
    }

    public map<U>(callback: (track: Track, index: number, array: Track[]) => U): U[] {
        return this.tracks.map(callback);
    }

    public at(index: number): Track | undefined {
        const actualIndex = index < 0 ? this.tracks.length + index : index;
        return this.tracks[actualIndex];
    }

    public swap(index1: number, index2: number): boolean {
        if (!Number.isSafeInteger(index1) || !Number.isSafeInteger(index2) || index1 < 0 || index1 >= this.tracks.length || index2 < 0 || index2 >= this.tracks.length) return false;
        
        [this.tracks[index1], this.tracks[index2]] = [this.tracks[index2], this.tracks[index1]];
        this._updateQueue();
        return true;
    }

    public replace(index: number, track: Track): boolean {
        if (!Number.isSafeInteger(index) || index < 0 || index >= this.tracks.length || !track) return false;
        if (this.manager.options.queue?.allowDuplicates === false && this.tracks.some((existing, i) => i !== index && existing.encoded === track.encoded)) return false;

        this.tracks[index] = track;
        this._updateQueue();
        return true;
    }

    public removeWhere(predicate: (track: Track) => boolean): Track[] {
        const removed: Track[] = [];
        const kept: Track[] = [];

        for (const track of this.tracks) {
            if (predicate(track)) {
                removed.push(track);
            } else {
                kept.push(track);
            }
        }

        if (removed.length > 0) {
            this.tracks = kept;
            this.manager.emit("queueRemove", this.player, removed);
            this._updateQueue();
        }

        return removed;
    }

    public truncate(size: number): boolean {
        if (!Number.isSafeInteger(size) || size < 0 || size >= this.tracks.length) return false;
        
        const removed = this.tracks.splice(size, this.tracks.length - size);
        if (removed.length > 0) {
            this.manager.emit("queueRemoveRange", this.player, removed, size, this.tracks.length + removed.length - 1);
            this._updateQueue();
            return true;
        }
        return false;
    }
}
