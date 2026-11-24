import { Track } from '../entities/Track';
import type { Node } from '../entities/Node';
import { resolveMetadata } from './MetadataTrackResolver';
import { awaitWithAbort } from './AbortableLookup';
import { validateLoadResponse } from '../backends/ProtocolValidation';

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
        // A resolved encoding belongs to a particular destination backend,
        // session and node instance. Reject stale replies after reconnect,
        // backend refresh, or replacement of a registered node.
        const session = target.sessionId;
        const socket = target.socket;
        const backend = target.backend;
        const registered = target.manager.nodes.nodes.get(target.identifier);
        const assertDestination = (): void => {
            signal?.throwIfAborted();
            if (target.destroyed || target.manager.destroyed ||
                target.sessionId !== session || target.socket !== socket ||
                target.backend !== backend ||
                target.manager.nodes.nodes.get(target.identifier) !== registered) {
                throw new TrackResolutionError('Destination node changed while resolving the track');
            }
        };
        const uri = track.getInfo().uri;
        const metadata = target.manager.options.search?.trackResolution;
        if ((!uri || !/^https?:\/\//i.test(uri)) && !metadata) {
            throw new TrackResolutionError('A track URI is required to resolve it on another backend');
        }
        // Resolve against the destination itself, never through Manager.search/native-source shortcuts.
        // v4 loading contract: https://lavalink.dev/api/rest#track-loading
        let loaded: Awaited<ReturnType<typeof target.rest.loadTracks>> | undefined;
        if (uri && /^https?:\/\//i.test(uri)) {
            const timeout = new AbortController();
            const timer = setTimeout(() => timeout.abort(new TrackResolutionError('Destination track lookup timed out')), 10000);
            const activeSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
            try {
                loaded = await awaitWithAbort(Promise.resolve().then(() => {
                    activeSignal.throwIfAborted();
                    return target.rest.loadTracks(uri, { timeoutMs: 10000, signal: activeSignal });
                }), activeSignal);
            } finally {
                clearTimeout(timer);
            }
        }
        assertDestination();
        if (loaded) {
            // A backend error is not an empty search result. In particular,
            // never bypass a provider's authorization/rate-limit failure by
            // automatically trying different metadata sources.
            validateLoadResponse(loaded);
            if (loaded.loadType === 'error') {
                throw new TrackResolutionError('Destination rejected the requested track URI');
            }
        }
        const data = loaded?.loadType === 'track' ? loaded.data : metadata ? await resolveMetadata(track, target, metadata, signal) : undefined;
        assertDestination();
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
