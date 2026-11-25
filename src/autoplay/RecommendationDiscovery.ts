import type { Track } from '../entities/Track';

export const recommendationProviders = ['spotify', 'deezer', 'tidal'] as const;
export type RecommendationProvider = typeof recommendationProviders[number];

/** Optional bounded discovery across additional providers on the same backend. */
export interface RecommendationDiscoveryOptions {
    providers: readonly RecommendationProvider[];
    timeoutMs?: number;
    maxCandidates?: number;
}

export function validateRecommendationDiscovery(options: RecommendationDiscoveryOptions): void {
    if (!options || typeof options !== 'object' || !Array.isArray(options.providers) ||
        options.providers.length < 1 || options.providers.length > recommendationProviders.length ||
        options.providers.some(provider => !recommendationProviders.includes(provider)) ||
        new Set(options.providers).size !== options.providers.length ||
        options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 60000) ||
        options.maxCandidates !== undefined && (!Number.isSafeInteger(options.maxCandidates) || options.maxCandidates < 1 || options.maxCandidates > 50)) {
        throw new TypeError('Invalid recommendation discovery options');
    }
}
export const providerSearch: Readonly<Record<RecommendationProvider, string>> = {
    spotify: 'spsearch', deezer: 'dzsearch', tidal: 'tdsearch'
};
export function providerRecommendation(provider: RecommendationProvider, identifier: string): { query: string; source: string } | undefined {
    if (provider === 'spotify') return /^[A-Za-z0-9]{22}$/.test(identifier) ? { query: 'seed_tracks=' + identifier, source: 'sprec' } : undefined;
    if (!/^\d+$/.test(identifier)) return undefined;
    return { query: identifier, source: provider === 'deezer' ? 'dzrec' : 'tdrec' };
}
type Metadata = { sourceName?: string; identifier?: string; isrc?: string | null; title?: string; author?: string; length?: number; isStream?: boolean };
export function recommendationInfo(track: Track): Metadata {
    if (typeof track.getInfo === 'function') return track.getInfo();
    const legacy = track as Track & { info?: Metadata };
    return legacy.info ?? { ...legacy, length: legacy.duration };
}
function normalized(value: unknown): string {
    return typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ') : '';
}
function isrc(value: unknown): string | undefined {
    const code = typeof value === 'string' ? value.replaceAll('-', '').toUpperCase() : '';
    return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(code) ? code : undefined;
}
/** Resolve a provider seed only when it represents the same recording. */
export function matchesRecommendationSeed(seed: Track, candidate: Track, provider: RecommendationProvider): boolean {
    const a = recommendationInfo(seed), b = recommendationInfo(candidate);
    if (b.sourceName?.toLowerCase() !== provider || !b.identifier || a.isStream || b.isStream) return false;
    const ac = isrc(a.isrc), bc = isrc(b.isrc);
    if (ac && bc) return ac === bc;
    const title = normalized(a.title ?? seed.title), author = normalized(a.author ?? seed.author);
    return !!title && !!author && title === normalized(b.title ?? candidate.title) && author === normalized(b.author ?? candidate.author) &&
        typeof a.length === 'number' && typeof b.length === 'number' && a.length > 0 && b.length > 0 && Math.abs(a.length - b.length) <= 3000;
}
/** Deduplicate exact provider IDs and valid cross-provider recording IDs. */
export function recommendationKeys(track: Track): string[] {
    const info = recommendationInfo(track);
    const code = isrc(info.isrc);
    const source = info.sourceName?.toLowerCase();
    const keys: string[] = [];
    if (source && info.identifier) keys.push('provider:' + source + ':' + info.identifier);
    if (code) keys.push('isrc:' + code);
    if (typeof track.encoded === 'string' && track.encoded) keys.push('encoded:' + track.encoded);
    return keys;
}
