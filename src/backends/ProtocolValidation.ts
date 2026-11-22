import type { ITrack, IRESTLoadTracks } from '../typings/Interfaces';

export class ProtocolResponseError extends TypeError {
    public readonly code = 'INVALID_PROTOCOL_RESPONSE';
    constructor(public readonly operation: string, public readonly field: string) {
        super(`Invalid ${operation} response: ${field}`);
        this.name = 'ProtocolResponseError';
    }
}

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateTrackResponse(value: unknown, operation = 'decode track'): asserts value is ITrack {
    if (!record(value) || typeof value.encoded !== 'string' || !value.encoded || !record(value.info)) {
        throw new ProtocolResponseError(operation, 'track envelope');
    }
    const info = value.info;
    if (typeof info.title !== 'string' || typeof info.author !== 'string' ||
        typeof info.identifier !== 'string' || typeof info.sourceName !== 'string' ||
        typeof info.length !== 'number' || !Number.isFinite(info.length) || (info.length < 0 && info.length !== -1) ||
        typeof info.position !== 'number' || !Number.isFinite(info.position) || info.position < 0 ||
        typeof info.isSeekable !== 'boolean' || typeof info.isStream !== 'boolean' ||
        (info.uri !== null && typeof info.uri !== 'string')) {
        throw new ProtocolResponseError(operation, 'track metadata');
    }
    for (const key of ['artworkUrl', 'isrc'] as const) {
        if (info[key] !== undefined && info[key] !== null && typeof info[key] !== 'string') {
            throw new ProtocolResponseError(operation, key);
        }
    }
    // Some providers omit these optional wire metadata objects.
    for (const key of ['pluginInfo', 'userData'] as const) {
        if (value[key] !== undefined && value[key] !== null && !record(value[key])) {
            throw new ProtocolResponseError(operation, key);
        }
    }
}

export function validateLoadResponse(value: unknown): asserts value is IRESTLoadTracks {
    if (!record(value)) throw new ProtocolResponseError('search', 'envelope');
    const data = value.data;
    switch (value.loadType) {
        case 'track': validateTrackResponse(data, 'search'); break;
        case 'search':
            if (!Array.isArray(data)) throw new ProtocolResponseError('search', 'track array');
            for (const track of data) validateTrackResponse(track, 'search');
            break;
        case 'playlist':
            if (!record(data) || !record(data.info) || typeof data.info.name !== 'string' ||
                typeof data.info.selectedTrack !== 'number' || !Number.isInteger(data.info.selectedTrack) ||
                !Array.isArray(data.tracks)) throw new ProtocolResponseError('search', 'playlist');
            for (const track of data.tracks) validateTrackResponse(track, 'search');
            break;
        case 'empty': break;
        case 'error':
            if (!record(data) || typeof data.message !== 'string') throw new ProtocolResponseError('search', 'error message');
            break;
        default: throw new ProtocolResponseError('search', 'loadType');
    }
}
