import type { Node } from '../entities/Node';
import type { Track } from '../entities/Track';
import type { ITrack } from '../typings/Interfaces';
import { validateLoadResponse } from '../backends/ProtocolValidation';
import { performance } from 'node:perf_hooks';
import { awaitWithAbort } from './AbortableLookup';

export interface MetadataResolutionOptions {
    sources: readonly ('youtube' | 'youtubemusic' | 'soundcloud')[];
    minimumScore?: number;
    durationToleranceMs?: number;
    maxCandidates?: number;
    /** Maximum elapsed time shared by all source/ISRC/title attempts; default 10 s. */
    timeoutMs?: number;
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
export async function resolveMetadata(track: Track, node: Node, options: MetadataResolutionOptions, callerSignal?: AbortSignal): Promise<ITrack | undefined> {
    if (!options || !Array.isArray(options.sources) || !options.sources.length || options.sources.length > 3 ||
        options.sources.some(source => !Object.hasOwn(prefixes, source)) ||
        options.minimumScore !== undefined && (!Number.isFinite(options.minimumScore) || options.minimumScore < 0 || options.minimumScore > 1) ||
        options.durationToleranceMs !== undefined && (!Number.isFinite(options.durationToleranceMs) || options.durationToleranceMs < 1 || options.durationToleranceMs > 60000) ||
        options.maxCandidates !== undefined && (!Number.isSafeInteger(options.maxCandidates) || options.maxCandidates < 1 || options.maxCandidates > 50) ||
        options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 60000)) {
        throw new TypeError('Invalid metadata track resolution options');
    }
    const seed = track.getInfo();
    if (seed.isStream || !seed.title?.trim() || !seed.author?.trim()) return;
    const code = isrc(seed.isrc);
    const queries = [...new Set([...(code ? [code] : []), `${seed.title} ${seed.author}`])];
    const budgetMs = options.timeoutMs ?? 10000;
    const started = performance.now();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error('Metadata resolution timed out')), budgetMs);
    const signal = callerSignal ? AbortSignal.any([timeout.signal, callerSignal]) : timeout.signal;
    try {
        for (const source of new Set<keyof typeof prefixes>(options.sources)) {
            if (node.backend?.featureStatus('source:' + source) === 'unavailable') continue;
            for (const query of queries) {
                signal.throwIfAborted();
                const remainingMs = Math.ceil(budgetMs - (performance.now() - started));
                if (remainingMs <= 0) {
                    timeout.abort(new Error('Metadata resolution timed out'));
                    signal.throwIfAborted();
                }
                // The same deadline is shared across every provider and query.
                // Abort the REST request when possible and end our wait even if an
                // injected transport disregards the cancellation signal.
                const response = await awaitWithAbort(
                    Promise.resolve().then(() => {
                        signal.throwIfAborted();
                        return node.rest.loadTracks(`${prefixes[source]}:${query}`, {
                            timeoutMs: remainingMs,
                            signal,
                        });
                    }),
                    signal,
                );
                signal.throwIfAborted();
                validateLoadResponse(response);
                const candidates = response.loadType === 'track' ? [response.data] : response.loadType === 'search' ? response.data : [];
                let selected: ITrack | undefined, best = options.minimumScore ?? 0.8;
                for (const candidate of candidates.slice(0, options.maxCandidates ?? 10)) {
                    const info = candidate.info;
                    if (info.isStream || !candidate.encoded) continue;
                    // Two explicitly different recording identifiers must not
                    // be considered the same recording merely because the
                    // artist/title/duration happen to match.
                    const candidateIsrc = isrc(info.isrc);
                    if (code && candidateIsrc && candidateIsrc !== code) continue;
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
    } finally {
        clearTimeout(timer);
    }
}
