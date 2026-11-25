import type { ITrack } from '../typings/Interfaces';
import { ProtocolResponseError, validateTrackResponse } from './ProtocolValidation';

export const lavaSearchTypes = ['track', 'album', 'artist', 'playlist', 'text'] as const;
export type LavaSearchType = typeof lavaSearchTypes[number];

export interface LavaSearchOptions {
    types?: readonly LavaSearchType[];
    signal?: AbortSignal;
    timeoutMs?: number;
}

export interface LavaSearchCollection {
    info: { name: string; selectedTrack: number };
    pluginInfo: Record<string, unknown>;
    tracks: ITrack[];
}

export interface LavaSearchText {
    text: string;
    plugin: Record<string, unknown>;
}

export interface LavaSearchResult {
    tracks?: ITrack[];
    albums?: LavaSearchCollection[];
    artists?: LavaSearchCollection[];
    playlists?: LavaSearchCollection[];
    texts?: LavaSearchText[];
    plugin: Record<string, unknown>;
}

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasLavaSearchPlugin(plugins: readonly { name: string }[]): boolean {
    return plugins.some(({ name }) => ['lavasearch', 'lavasearch-plugin'].includes(name.toLowerCase()));
}

export function lavaSearchParameters(query: string, options: LavaSearchOptions = {}): URLSearchParams {
    if (typeof query !== 'string' || !query.trim() || query.length > 4096) {
        throw new TypeError('LavaSearch requires a nonempty query of at most 4096 characters');
    }
    if (!record(options)) throw new TypeError('Invalid LavaSearch options');
    const types = options.types === undefined ? lavaSearchTypes : options.types;
    if (!Array.isArray(types) || !types.length || types.length > lavaSearchTypes.length ||
        types.some(type => !lavaSearchTypes.includes(type)) || new Set(types).size !== types.length) {
        throw new TypeError('Invalid LavaSearch result types');
    }
    if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) ||
        options.timeoutMs < 1 || options.timeoutMs > 60000)) {
        throw new TypeError('Invalid LavaSearch timeout');
    }
    return new URLSearchParams({ query, types: types.join(',') });
}

export function validateLavaSearch(value: unknown): asserts value is LavaSearchResult {
    const fail = (field: string): never => { throw new ProtocolResponseError('LavaSearch', field); };
    if (!record(value) || !record(value.plugin)) throw new ProtocolResponseError('LavaSearch', 'result envelope');
    if (value.tracks !== undefined) {
        if (!Array.isArray(value.tracks)) throw new ProtocolResponseError('LavaSearch', 'tracks');
        for (const track of value.tracks) validateTrackResponse(track, 'LavaSearch');
    }
    for (const key of ['albums', 'artists', 'playlists'] as const) {
        const entries = value[key];
        if (entries === undefined) continue;
        if (!Array.isArray(entries)) throw new ProtocolResponseError('LavaSearch', key);
        for (const entry of entries) {
            if (!record(entry) || !record(entry.info) || typeof entry.info.name !== 'string' ||
                typeof entry.info.selectedTrack !== 'number' || !Number.isInteger(entry.info.selectedTrack) ||
                !record(entry.pluginInfo) || !Array.isArray(entry.tracks)) {
                throw new ProtocolResponseError('LavaSearch', key);
            }
            for (const track of entry.tracks) validateTrackResponse(track, 'LavaSearch');
        }
    }
    if (value.texts !== undefined) {
        if (!Array.isArray(value.texts)) throw new ProtocolResponseError('LavaSearch', 'texts');
        for (const entry of value.texts) {
            if (!record(entry) || typeof entry.text !== 'string' || !record(entry.plugin)) fail('texts');
        }
    }
}
