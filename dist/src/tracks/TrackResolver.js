"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackResolver = exports.TrackResolutionError = void 0;
const OpenTelemetry_1 = require("../observability/OpenTelemetry");
const Track_1 = require("../entities/Track");
const MetadataTrackResolver_1 = require("./MetadataTrackResolver");
const AbortableLookup_1 = require("./AbortableLookup");
const ProtocolValidation_1 = require("../backends/ProtocolValidation");
class TrackResolutionError extends Error {
    code = 'TRACK_RESOLUTION_FAILED';
    constructor(message) { super(message); this.name = 'TrackResolutionError'; }
}
exports.TrackResolutionError = TrackResolutionError;
class TrackResolver {
    static async resolve(track, target, source, signal) {
        return (0, OpenTelemetry_1.observeOperation)(target.manager, 'nyxlink.resolve', async () => {
            signal?.throwIfAborted();
            const origin = track.backend ?? source?.backend?.kind;
            const destination = target.backend?.kind;
            const internal = track.pluginInfo?.needsStream === true;
            if (!internal && (origin === destination || !origin && !source))
                return track;
            if (!internal && source && !origin && !destination)
                return track;
            if (!destination)
                throw new TrackResolutionError('Destination backend identity is unknown');
            const session = target.sessionId;
            const socket = target.socket;
            const backend = target.backend;
            const registered = target.manager.nodes.nodes.get(target.identifier);
            const assertDestination = () => {
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
            let loaded;
            if (uri && /^https?:\/\//i.test(uri)) {
                const timeout = new AbortController();
                const timer = setTimeout(() => timeout.abort(new TrackResolutionError('Destination track lookup timed out')), 10000);
                const activeSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
                try {
                    loaded = await (0, AbortableLookup_1.awaitWithAbort)(Promise.resolve().then(() => {
                        activeSignal.throwIfAborted();
                        return target.rest.loadTracks(uri, { timeoutMs: 10000, signal: activeSignal });
                    }), activeSignal);
                }
                finally {
                    clearTimeout(timer);
                }
            }
            assertDestination();
            if (loaded) {
                (0, ProtocolValidation_1.validateLoadResponse)(loaded);
                if (loaded.loadType === 'error') {
                    throw new TrackResolutionError('Destination rejected the requested track URI');
                }
            }
            const data = loaded?.loadType === 'track' ? loaded.data : metadata ? await (0, MetadataTrackResolver_1.resolveMetadata)(track, target, metadata, signal) : undefined;
            assertDestination();
            if (!data || typeof data.encoded !== 'string' || !data.encoded || !data.info) {
                throw new TrackResolutionError('Destination could not load the requested track URI');
            }
            const info = data.info;
            const validDuration = Number.isFinite(info.length) && (info.length >= 0 || destination === 'nodelink' && info.length === -1);
            if (![info.title, info.author, info.identifier, info.sourceName].every(value => typeof value === 'string') || !validDuration) {
                throw new TrackResolutionError('Destination returned invalid track metadata');
            }
            if (target.manager.options.sources?.disabledSources?.some(source => source.toLowerCase() === info.sourceName.toLowerCase())) {
                throw new TrackResolutionError('Destination returned a disabled track source');
            }
            const resolved = new Track_1.Track(data, track.requester, track.origin, []);
            resolved.userData = { ...track.userData };
            resolved.position = track.getInfo().position;
            resolved.backend = destination;
            return resolved;
        });
    }
}
exports.TrackResolver = TrackResolver;
//# sourceMappingURL=TrackResolver.js.map