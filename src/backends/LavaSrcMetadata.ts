/** LavaSrc plugin metadata is optional and distinct from playable audio availability. */
export interface LavaSrcTrackMetadata {
    albumName?: string | null;
    albumArtUrl?: string | null;
    artistUrl?: string | null;
    artistArtworkUrl?: string | null;
    previewUrl?: string | null;
    isPreview?: boolean;
}
export type LavaSrcPlaylistType = 'album' | 'playlist' | 'artist' | 'recommendations';
export interface LavaSrcPlaylistMetadata {
    type?: LavaSrcPlaylistType;
    url?: string | null;
    artworkUrl?: string | null;
    author?: string | null;
    totalTracks?: number | null;
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const trackStrings = ['albumName', 'albumArtUrl', 'artistUrl', 'artistArtworkUrl', 'previewUrl'] as const;
const playlistStrings = ['url', 'artworkUrl', 'author'] as const;

/** Keep unknown/malformed values out of the typed view without destroying raw plugin data. */
export function readLavaSrcTrackMetadata(value: unknown): LavaSrcTrackMetadata | undefined {
    if (!object(value)) return undefined;
    const result: LavaSrcTrackMetadata = {};
    for (const key of trackStrings) {
        const field = value[key];
        if (field === null || typeof field === 'string') result[key] = field;
    }
    if (typeof value.isPreview === 'boolean') result.isPreview = value.isPreview;
    return Object.keys(result).length ? result : undefined;
}
export function readLavaSrcPlaylistMetadata(value: unknown): LavaSrcPlaylistMetadata | undefined {
    if (!object(value)) return undefined;
    const result: LavaSrcPlaylistMetadata = {};
    for (const key of playlistStrings) {
        const field = value[key];
        if (field === null || typeof field === 'string') result[key] = field;
    }
    const type = value.type;
    if (type === 'album' || type === 'playlist' || type === 'artist' || type === 'recommendations') result.type = type;
    const count = value.totalTracks;
    if (count === null || typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) result.totalTracks = count;
    return Object.keys(result).length ? result : undefined;
}
