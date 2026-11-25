/** NodeLink Holo pluginInfo: compound fields may be JSON strings or native values. */
export interface HoloAudioTrack {
    id: string;
    name?: string;
    isDefault: boolean;
    isAutoDubbed: boolean;
}
export interface HoloTrackMetadata {
    type: 'holo';
    description?: string;
    publishedAt?: string;
    views?: number;
    likes?: number;
    channelName?: string;
    channelId?: string;
    channelVerified?: boolean;
    keywords: string[];
    audioTracks: HoloAudioTrack[];
    audioFormats: Record<string, unknown>[];
    videoQualities: Record<string, unknown>[];
    captions: Record<string, unknown>[];
    channel?: Record<string, unknown>;
    externalLinks?: Record<string, unknown>;
}
const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
function decoded(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    if (value.length > 262144) return undefined;
    try { return JSON.parse(value) as unknown; } catch { return undefined; }
}
function list(value: unknown): unknown[] {
    const parsed = decoded(value);
    return Array.isArray(parsed) ? parsed.slice(0, 256) : [];
}
function rows(value: unknown): Record<string, unknown>[] {
    return structuredClone(list(value).filter(record));
}
function object(value: unknown): Record<string, unknown> | undefined {
    const parsed = decoded(value);
    return record(parsed) ? structuredClone(parsed) : undefined;
}
const string = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined;
const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

/** Returns a detached, tolerant metadata projection; does not resolve URLs or mutate tracks. */
export function readHoloTrackMetadata(value: unknown): HoloTrackMetadata | undefined {
    if (!record(value) || value.type !== 'holo') return undefined;
    const audioTracks: HoloAudioTrack[] = [];
    const ids = new Set<string>();
    for (const item of list(value.audioTracks)) {
        if (!record(item) || typeof item.id !== 'string' || !item.id || ids.has(item.id)) continue;
        ids.add(item.id);
        audioTracks.push({ id: item.id, name: string(item.name), isDefault: item.isDefault === true, isAutoDubbed: item.isAutoDubbed === true });
    }
    return {
        type: 'holo', description: string(value.description), publishedAt: string(value.publishedAt),
        views: count(value.views), likes: count(value.likes), channelName: string(value.channelName),
        channelId: string(value.channelId), channelVerified: typeof value.channelVerified === 'boolean' ? value.channelVerified : undefined,
        keywords: list(value.keywords).filter((item): item is string => typeof item === 'string'),
        audioTracks, audioFormats: rows(value.audioFormats), videoQualities: rows(value.videoQualities),
        captions: rows(value.captions), channel: object(value.channel), externalLinks: object(value.externalLinks)
    };
}
