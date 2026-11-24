"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMetadata = resolveMetadata;
const ProtocolValidation_1 = require("../backends/ProtocolValidation");
const node_perf_hooks_1 = require("node:perf_hooks");
const AbortableLookup_1 = require("./AbortableLookup");
const prefixes = { youtube: 'ytsearch', youtubemusic: 'ytmsearch', soundcloud: 'scsearch' };
const normalized = (value) => [...new Set(value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
const similarity = (a, b) => {
    const left = normalized(a), right = new Set(normalized(b));
    return left.length && right.size ? left.filter(token => right.has(token)).length / Math.max(left.length, right.size) : 0;
};
const isrc = (value) => {
    const normalized = typeof value === 'string' ? value.replaceAll('-', '').toUpperCase() : '';
    return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalized) ? normalized : undefined;
};
async function resolveMetadata(track, node, options, callerSignal) {
    if (!options || !Array.isArray(options.sources) || !options.sources.length || options.sources.length > 3 ||
        options.sources.some(source => !Object.hasOwn(prefixes, source)) ||
        options.minimumScore !== undefined && (!Number.isFinite(options.minimumScore) || options.minimumScore < 0 || options.minimumScore > 1) ||
        options.durationToleranceMs !== undefined && (!Number.isFinite(options.durationToleranceMs) || options.durationToleranceMs < 1 || options.durationToleranceMs > 60000) ||
        options.maxCandidates !== undefined && (!Number.isSafeInteger(options.maxCandidates) || options.maxCandidates < 1 || options.maxCandidates > 50) ||
        options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 60000)) {
        throw new TypeError('Invalid metadata track resolution options');
    }
    const seed = track.getInfo();
    if (seed.isStream || !seed.title?.trim() || !seed.author?.trim())
        return;
    const code = isrc(seed.isrc);
    const disabledSources = new Set((node.manager.options.sources?.disabledSources ?? []).map(source => source.toLowerCase()));
    const queries = [...new Set([...(code ? [code] : []), `${seed.title} ${seed.author}`])];
    const budgetMs = options.timeoutMs ?? 10000;
    const started = node_perf_hooks_1.performance.now();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error('Metadata resolution timed out')), budgetMs);
    const signal = callerSignal ? AbortSignal.any([timeout.signal, callerSignal]) : timeout.signal;
    try {
        for (const source of new Set(options.sources)) {
            if (disabledSources.has(source) || node.backend?.featureStatus('source:' + source) === 'unavailable')
                continue;
            for (const query of queries) {
                signal.throwIfAborted();
                const remainingMs = Math.ceil(budgetMs - (node_perf_hooks_1.performance.now() - started));
                if (remainingMs <= 0) {
                    timeout.abort(new Error('Metadata resolution timed out'));
                    signal.throwIfAborted();
                }
                const response = await (0, AbortableLookup_1.awaitWithAbort)(Promise.resolve().then(() => {
                    signal.throwIfAborted();
                    return node.rest.loadTracks(`${prefixes[source]}:${query}`, {
                        timeoutMs: remainingMs,
                        signal,
                    });
                }), signal);
                signal.throwIfAborted();
                (0, ProtocolValidation_1.validateLoadResponse)(response);
                if (response.loadType === 'error') {
                    throw new Error('Metadata source rejected the lookup');
                }
                const candidates = response.loadType === 'track' ? [response.data] : response.loadType === 'search' ? response.data : [];
                let selected, best = options.minimumScore ?? 0.8;
                for (const candidate of candidates.slice(0, options.maxCandidates ?? 10)) {
                    const info = candidate.info;
                    if (info.isStream || !candidate.encoded || disabledSources.has(info.sourceName.toLowerCase()))
                        continue;
                    const candidateIsrc = isrc(info.isrc);
                    if (code && candidateIsrc && candidateIsrc !== code)
                        continue;
                    const difference = Math.abs(seed.length - info.length);
                    const tolerance = options.durationToleranceMs ?? 10000;
                    if (seed.length > 0 && info.length > 0 && difference > tolerance)
                        continue;
                    const score = code && isrc(info.isrc) === code ? 1 :
                        similarity(seed.title, info.title) * 0.5 + similarity(seed.author, info.author) * 0.35 +
                            (seed.length > 0 && info.length > 0 ? Math.max(0, 1 - difference / tolerance) * 0.15 : 0);
                    if (score >= best && (!selected || score > best)) {
                        best = score;
                        selected = candidate;
                    }
                }
                if (selected)
                    return selected;
            }
        }
    }
    finally {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=MetadataTrackResolver.js.map