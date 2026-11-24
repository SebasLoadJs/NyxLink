import type { Node } from '../entities/Node';
import type { Track } from '../entities/Track';
import type { ITrack } from '../typings/Interfaces';
import { validateLoadResponse } from '../backends/ProtocolValidation';

export interface MetadataResolutionOptions {
    sources: readonly ('youtube' | 'youtubemusic' | 'soundcloud')[];
    minimumScore?: number;
    durationToleranceMs?: number;
    maxCandidates?: number;
}
const prefixes = { youtube: 'ytsearch', youtubemusic: 'ytmsearch', soundcloud: 'scsearch' } as const;
const normalized = (value: string): string[] => [...new Set(value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
const similarity = (a: string, b: string): number => {
    const left = normalized(a), right = new Set(normalized(b));
    return left.length && right.size ? left.filter(token => right.has(token)).length / Math.max(left.length, right.size) : 0;
};
const isrc = (value: unknown): string | undefined => {
    const normalized = typeof value === 'string' ? value.replaceAll('-', '').toUpperCase() : '';
    return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalized) ? normalized : undefined;
};

/** Explicit fallback policy against the destination itself, with no native-provider recursion. */
export async function resolveMetadata(track: Track, node: Node, options: MetadataResolutionOptions): Promise<ITrack | undefined> {
    if (!options || !Array.isArray(options.sources) || !options.sources.length || options.sources.length > 3 ||
        options.sources.some(source => !Object.hasOwn(prefixes, source)) ||
        options.minimumScore !== undefined && (!Number.isFinite(options.minimumScore) || options.minimumScore < 0 || options.minimumScore > 1) ||
        options.durationToleranceMs !== undefined && (!Number.isFinite(options.durationToleranceMs) || options.durationToleranceMs < 1 || options.durationToleranceMs > 60000) ||
        options.maxCandidates !== undefined && (!Number.isSafeInteger(options.maxCandidates) || options.maxCandidates < 1 || options.maxCandidates > 50)) {
        throw new TypeError('Invalid metadata track resolution options');
    }
    const seed = track.getInfo();
    if (seed.isStream || !seed.title?.trim() || !seed.author?.trim()) return;
    const code = isrc(seed.isrc);
    const queries = [...new Set([...(code ? [code] : []), `${seed.title} ${seed.author}`])];
    for (const source of new Set<keyof typeof prefixes>(options.sources)) {
        if (node.backend?.featureStatus('source:' + source) === 'unavailable') continue;
        for (const query of queries) {
            const response = await node.rest.loadTracks(`${prefixes[source]}:${query}`, { timeoutMs: 10000 });
            validateLoadResponse(response);
            const candidates = response.loadType === 'track' ? [response.data] : response.loadType === 'search' ? response.data : [];
            let selected: ITrack | undefined, best = options.minimumScore ?? 0.8;
            for (const candidate of candidates.slice(0, options.maxCandidates ?? 10)) {
                const info = candidate.info;
                if (info.isStream || !candidate.encoded) continue;
                const difference = Math.abs(seed.length - info.length);
                const tolerance = options.durationToleranceMs ?? 10000;
                if (seed.length > 0 && info.length > 0 && difference > tolerance) continue;
                const score = code && isrc(info.isrc) === code ? 1 :
                    similarity(seed.title, info.title) * 0.5 + similarity(seed.author, info.author) * 0.35 +
                    (seed.length > 0 && info.length > 0 ? Math.max(0, 1 - difference / tolerance) * 0.15 : 0);
                if (score >= best && (!selected || score > best)) { best = score; selected = candidate; }
            }
            if (selected) return selected;
        }
    }
}
