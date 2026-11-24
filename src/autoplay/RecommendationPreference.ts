import type { Track } from '../entities/Track';

/** Metadata only; scoring cannot edit the SDK's candidate Track through this view. */
export interface RecommendationCandidate {
    readonly title: string;
    readonly author: string;
    readonly durationMs: number;
    readonly source: string;
    readonly isrc?: string;
}
export interface RecommendationPreferences {
    /** Synchronous, finite score; larger wins. Equal scores retain random choice. */
    score(candidate: RecommendationCandidate, context: { readonly guildId: string; readonly seed: RecommendationCandidate }): number;
}

function metadata(track: Track): RecommendationCandidate {
    const info = track.getInfo();
    return Object.freeze({ title: info.title, author: info.author, durationMs: info.length, source: info.sourceName,
        ...(typeof info.isrc === 'string' ? { isrc: info.isrc } : {}) });
}

/** Optional application taste signal; no history collection, persistence or provider request. */
export function preferredRecommendations(candidates: Track[], seed: Track, guildId: string, preferences?: RecommendationPreferences): Track[] {
    if (!preferences) return candidates;
    try {
        if (typeof preferences.score !== 'function') return candidates;
        const context = Object.freeze({ guildId, seed: metadata(seed) });
        const scored = candidates.map(track => {
            const value: unknown = preferences.score(metadata(track), context);
            if (value instanceof Promise) void value.catch(() => {});
            if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Preference scores must be finite');
            return { track, value };
        });
        const best = scored.reduce((score, entry) => Math.max(score, entry.value), -Infinity);
        return scored.filter(entry => entry.value === best).map(entry => entry.track);
    } catch { return candidates; }
}
