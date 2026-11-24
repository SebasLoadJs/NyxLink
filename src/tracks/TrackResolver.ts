import { Track } from '../entities/Track';
import type { Node } from '../entities/Node';
import { resolveMetadata } from './MetadataTrackResolver';

export class TrackResolutionError extends Error {
    public readonly code = 'TRACK_RESOLUTION_FAILED';
    constructor(message: string) { super(message); this.name = 'TrackResolutionError'; }
}

export class TrackResolver {
    public static async resolve(track: Track, target: Node, source?: Node, signal?: AbortSignal): Promise<Track> {
        signal?.throwIfAborted();
        const origin = track.backend ?? source?.backend?.kind;
        const destination = target.backend?.kind;
        const internal = track.pluginInfo?.needsStream === true;
        if (!internal && (origin === destination || !origin && !source)) return track;
        if (!internal && source && !origin && !destination) return track;
        if (!destination) throw new TrackResolutionError('Destination backend identity is unknown');
        const uri = track.getInfo().uri;
        const metadata = target.manager.options.search?.trackResolution;
        if ((!uri || !/^https?:\/\//i.test(uri)) && !metadata) {
            throw new TrackResolutionError('A track URI is required to resolve it on another backend');
        }
        // Resolve against the destination itself, never through Manager.search/native-source shortcuts.
        // v4 loading contract: https://lavalink.dev/api/rest#track-loading
        const loaded = uri && /^https?:\/\//i.test(uri) ? await target.rest.loadTracks(uri, { timeoutMs: 10000, signal }) : undefined;
        signal?.throwIfAborted();
        const data = loaded?.loadType === 'track' ? loaded.data : metadata ? await resolveMetadata(track, target, metadata, signal) : undefined;
        signal?.throwIfAborted();
        if (!data || typeof data.encoded !== 'string' || !data.encoded || !data.info) {
            throw new TrackResolutionError('Destination could not load the requested track URI');
        }
        const info = data.info;
        // NodeLink HTTP uses -1 for unknown duration; retain the observed value.
        // https://github.com/PerformanC/NodeLink/blob/804e0d6d0f1af30384e0a2d12ddbc8d79e85cf35/src/sources/http.ts#L403
        const validDuration = Number.isFinite(info.length) && (info.length >= 0 || destination === 'nodelink' && info.length === -1);
        if (![info.title, info.author, info.identifier, info.sourceName].every(value => typeof value === 'string') || !validDuration) {
            throw new TrackResolutionError('Destination returned invalid track metadata');
        }
        const resolved = new Track(data, track.requester, track.origin, []);
        resolved.userData = { ...track.userData };
        resolved.position = track.getInfo().position;
        resolved.backend = destination;
        return resolved;
    }
}
