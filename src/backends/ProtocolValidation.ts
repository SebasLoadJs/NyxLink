import type { ITrack, IRESTLoadTracks, IRESTGetPlayers } from '../typings/Interfaces';
import type { PlayerUpdateAcknowledgement, SessionUpdateResponse } from './ProtocolContracts';

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

function nonnegative(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Read responses must identify a real guild and provide the state used by recovery. */
export function validatePlayerRead(value: unknown, guildId?: string): asserts value is IRESTGetPlayers {
    const operation = 'get player';
    if (!record(value) || typeof value.guildId !== 'string' || !/^\d{17,20}$/.test(value.guildId) ||
        (guildId !== undefined && value.guildId !== guildId)) {
        throw new ProtocolResponseError(operation, 'guild identity');
    }
    if (!nonnegative(value.volume) || value.volume > 1000 || typeof value.paused !== 'boolean' ||
        !record(value.state) || !nonnegative(value.state.position)) {
        throw new ProtocolResponseError(operation, 'playback state');
    }
    if (value.track !== null && value.track !== undefined) validateTrackResponse(value.track, operation);
}

/** Preserve partial acknowledgements from compatible servers while verifying known fields. */
export function validatePlayerAcknowledgement(value: unknown, guildId: string): asserts value is PlayerUpdateAcknowledgement {
    const operation = 'update player';
    if (!record(value)) throw new ProtocolResponseError(operation, 'envelope');
    if (value.guildId !== undefined && value.guildId !== guildId) throw new ProtocolResponseError(operation, 'guild identity');
    if (value.volume !== undefined && (!nonnegative(value.volume) || value.volume > 1000)) throw new ProtocolResponseError(operation, 'volume');
    if (value.paused !== undefined && typeof value.paused !== 'boolean') throw new ProtocolResponseError(operation, 'paused');
    if (value.state !== undefined && (!record(value.state) || !nonnegative(value.state.position))) throw new ProtocolResponseError(operation, 'playback state');
    if (value.track !== undefined && value.track !== null) {
        if (!record(value.track) || (value.track.encoded !== null && (typeof value.track.encoded !== 'string' || !value.track.encoded))) {
            throw new ProtocolResponseError(operation, 'track acknowledgement');
        }
        if (value.track.info !== undefined) validateTrackResponse(value.track, operation);
    }
}

export function validateSessionResponse(value: unknown): asserts value is SessionUpdateResponse {
    if (!record(value) || typeof value.resuming !== 'boolean' || !nonnegative(value.timeout)) {
        throw new ProtocolResponseError('update session', 'resume configuration');
    }
}
