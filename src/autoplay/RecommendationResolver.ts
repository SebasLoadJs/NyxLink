import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';
import type { Track } from '../entities/Track';
import type { ISearchQuery } from '../typings/Interfaces';
import { playbackGuard } from '../players/PlaybackGuard';
import { awaitWithAbort } from '../tracks/AbortableLookup';
import { matchesRecommendationSeed, providerRecommendation, providerSearch, recommendationInfo, recommendationKeys, validateRecommendationDiscovery } from './RecommendationDiscovery';

const requests = new WeakMap<Player, AbortController>();
const validYouTubeId = (value: string): boolean => /^[A-Za-z0-9_-]{11}$/.test(value);

/** Bounded, cancellation-aware recommendations against an explicit seed. Never starts playback. */
export class RecommendationResolver {
    public static async update(node: Node, player: Player, track: Track): Promise<void> {
        requests.get(player)?.abort(new Error('Recommendation lookup superseded'));
        const request = new AbortController();
        requests.set(player, request);
        const guard = playbackGuard(player);
        const ticket = guard.ticket, autoTicket = guard.automaticTicket;
        const config = node.manager.options.recommendationDiscovery;
        const active = () => requests.get(player) === request && !player.destroyed &&
            (!player.node || player.node === node) && !node.destroyed &&
            guard.isCurrent(ticket) && guard.isAutoCurrent(autoTicket);
        if (active()) player.recommendations = [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            if (!track || !active()) return;
            if (config !== undefined) validateRecommendationDiscovery(config);
            const info = recommendationInfo(track);
            if (!info.sourceName || !info.identifier) return;
            const source = info.sourceName.toLowerCase(), identifier = info.identifier;
            const signal = AbortSignal.any([guard.signal, guard.automaticSignal, request.signal]);
            timer = setTimeout(() => request.abort(new Error('Recommendation lookup timed out')), config?.timeoutMs ?? 10000);
            const search = async (query: Pick<ISearchQuery, 'query' | 'source'>): Promise<Track[]> => {
                signal.throwIfAborted();
                if (!active()) return [];
                const result = await awaitWithAbort(Promise.resolve().then(() => {
                    signal.throwIfAborted();
                    return node.manager.search({ ...query, node: node.identifier, requester: track.requester, signal });
                }), signal);
                return active() && result?.loadType !== 'error' && Array.isArray(result?.tracks) ? result.tracks : [];
            };
            const disabled = new Set((node.manager.options.sources?.disabledSources ?? []).map(value => value.toLowerCase()));
            const supported = (provider: string): boolean =>
                !disabled.has(provider) && node.isNodeLink && node.capabilities.has('source:' + provider);
            const youtubeMix = (id: string, music = false) => ({
                query: 'https://' + (music ? 'music' : 'www') + '.youtube.com/watch?v=' + id + '&list=RD' + id,
                source: music ? 'youtubemusic' : 'youtube'
            });
            let primary: Pick<ISearchQuery, 'query' | 'source'> | undefined;
            if (source === 'youtube' || source === 'youtubemusic') {
                if (!validYouTubeId(identifier)) return;
                primary = youtubeMix(identifier, source === 'youtubemusic');
            } else if ((source === 'spotify' || source === 'deezer' || source === 'tidal') && supported(source)) {
                primary = providerRecommendation(source, identifier);
            } else if (source === 'applemusic' && supported(source)) {
                primary = { query: identifier, source: 'amrec' };
            } else if (source === 'soundcloud') {
                primary = { query: track.author, source: 'soundcloud' };
            }
            if (!primary && source !== 'youtube' && !disabled.has('youtube')) {
                const seeds = await search({ query: track.title + ' ' + track.author, source: 'youtube' });
                const seed = seeds.map(recommendationInfo).find(candidate =>
                    (candidate.sourceName === 'youtube' || candidate.sourceName === 'youtubemusic') &&
                    typeof candidate.identifier === 'string' && validYouTubeId(candidate.identifier));
                if (seed?.identifier) primary = youtubeMix(seed.identifier);
            }
            const candidates: Track[] = [];
            const collect = async (query: Pick<ISearchQuery, 'query' | 'source'>) => {
                try { candidates.push(...(await search(query)).slice(0, 50)); }
                catch (error) {
                    if (signal.aborted || !config) throw error;
                    node.manager.emit('debug', 'NyxLink > RecommendationResolver > Provider lookup failed.');
                }
            };
            if (primary) await collect(primary);
            // Opt-in additional providers; never fabricate IDs from a different catalogue.
            for (const provider of config?.providers ?? []) {
                if (!active() || signal.aborted) break;
                if (provider === source || !supported(provider)) continue;
                try {
                    const seeds = await search({ query: track.title + ' ' + track.author, source: providerSearch[provider] });
                    const seed = seeds.slice(0, 50).find(candidate => matchesRecommendationSeed(track, candidate, provider));
                    const id = seed && recommendationInfo(seed).identifier;
                    const query = id ? providerRecommendation(provider, id) : undefined;
                    if (query) await collect(query);
                } catch {
                    if (signal.aborted) break;
                    node.manager.emit('debug', 'NyxLink > RecommendationResolver > Additional provider lookup failed.');
                }
            }
            if (!active()) return;
            const historyLimit = node.manager.options.queue?.historyLimit ?? player.historySize ?? 10;
            const previous = Array.isArray(player.previous) && historyLimit > 0 ? player.previous.slice(-historyLimit) : [];
            const queued = Array.isArray(player.queue?.tracks) ? player.queue.tracks : [];
            const seen = new Set([track, ...previous, ...queued].filter(Boolean).flatMap(recommendationKeys));
            const selected: Track[] = [];
            for (const candidate of candidates) {
                if (!candidate || !candidate.encoded || disabled.has(recommendationInfo(candidate).sourceName?.toLowerCase() ?? '')) continue;
                const keys = recommendationKeys(candidate);
                if (!keys.length || keys.some(key => seen.has(key))) continue;
                keys.forEach(key => seen.add(key));
                selected.push(candidate);
                if (selected.length >= (config?.maxCandidates ?? 50)) break;
            }
            if (active()) player.recommendations = selected;
        } catch {
            if (active() && !request.signal.aborted) node.manager.emit('debug', 'NyxLink > RecommendationResolver > Lookup failed.');
        } finally {
            if (timer) clearTimeout(timer);
            if (requests.get(player) === request) requests.delete(player);
        }
    }
}
