"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferredRecommendations = preferredRecommendations;
function metadata(track) {
    const info = track.getInfo();
    return Object.freeze({ title: info.title, author: info.author, durationMs: info.length, source: info.sourceName,
        ...(typeof info.isrc === 'string' ? { isrc: info.isrc } : {}) });
}
function preferredRecommendations(candidates, seed, guildId, preferences) {
    if (!preferences)
        return candidates;
    try {
        if (typeof preferences.score !== 'function')
            return candidates;
        const context = Object.freeze({ guildId, seed: metadata(seed) });
        const scored = candidates.map(track => {
            const value = preferences.score(metadata(track), context);
            if (value instanceof Promise)
                void value.catch(() => { });
            if (typeof value !== 'number' || !Number.isFinite(value))
                throw new TypeError('Preference scores must be finite');
            return { track, value };
        });
        const best = scored.reduce((score, entry) => Math.max(score, entry.value), -Infinity);
        return scored.filter(entry => entry.value === best).map(entry => entry.track);
    }
    catch {
        return candidates;
    }
}
//# sourceMappingURL=RecommendationPreference.js.map