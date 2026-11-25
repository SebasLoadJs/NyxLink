import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';
import type { Track } from '../entities/Track';
import type { ISearchQuery } from '../typings/Interfaces';
import { disabledSource } from '../search/SourceRouting';
import { playbackGuard } from '../players/PlaybackGuard';
import { awaitWithAbort } from '../tracks/AbortableLookup';
import { matchesRecommendationSeed, providerRecommendation, providerSearch, recommendationInfo, recommendationKeys, validateRecommendationDiscovery } from './RecommendationDiscovery';

const requests = new WeakMap<Player, AbortController>();
const validYouTubeId = (value: string): boolean => /^[A-Za-z0-9_-]{11}$/.test(value);

/** Bounded, cancellation-aware recommendations against an explicit seed. Never starts playback. */
export class RecommendationResolver {
    public static async update(node: Node, player: Player, track: Track): Promise<void> {
        // A late callback from a previous node must not cancel the current lookup.
        if (player.destroyed || node.destroyed || player.node && player.node !== node || node.manager.destroyed) return;
        const session = node.sessionId, socket = node.socket, backend = node.backend;
        requests.get(player)?.abort(new Error('Recommendation lookup superseded'));
        const request = new AbortController();
        requests.set(player, request);
        const guard = playbackGuard(player);
        const ticket = guard.ticket, autoTicket = guard.automaticTicket;
        const config = node.manager.options.recommendationDiscovery;
        const active = () => requests.get(player) === request && !player.destroyed &&
            (!player.node || player.node === node) && !node.destroyed && !node.manager.destroyed &&
            node.sessionId === session && node.socket === socket && node.backend === backend &&
            guard.isCurrent(ticket) && guard.isAutoCurrent(autoTicket);
        if (active()) player.recommendations = [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            if (!track || !active()) return;
            if (config !== undefined) validateRecommendationDiscovery(config);
            const info = recommendationInfo(track);
            if (!info.sourceName || !info.identifier) return;
            const source = info.sourceName.toLowerCase(), identifier = info.identifier;
            const title = info.title ?? track.title, author = info.author ?? track.author;
            const queryText = [title, author].filter(value => typeof value === 'string' && value.trim()).join(' ');
            const signal = AbortSignal.any([guard.signal, guard.automaticSignal, request.signal]);
            timer = setTimeout(() => request.abort(new Error('Recommendation lookup timed out')), config?.timeoutMs ?? 10000);
            const search = async (query: Pick<ISearchQuery, 'query' | 'source'>): Promise<Track[]> => {
                signal.throwIfAborted();
                if (!active()) return [];
                const result = await awaitWithAbort(node.manager.search({ ...query, node: node.identifier, requester: track.requester, signal }), signal);
                return active() && result?.loadType !== 'error' && Array.isArray(result?.tracks) ? result.tracks : [];
            };
            const disabled = node.manager.options.sources?.disabledSources ?? [];
            const isDisabled = (provider: string): boolean => disabledSource(provider, disabled);
            const supported = (provider: string): boolean =>
                !isDisabled(provider) && node.isNodeLink && node.capabilities.has('source:' + provider);
            const youtubeMix = (id: string, music = false) => ({
                query: 'https://' + (music ? 'music' : 'www') + '.youtube.com/watch?v=' + id + '&list=RD' + id,
                source: music ? 'youtubemusic' : 'youtube'
            });
            let primary: Pick<ISearchQuery, 'query' | 'source'> | undefined;
            if (source === 'youtube' || source === 'youtubemusic') {
                if (!validYouTubeId(identifier) || isDisabled('youtube')) return;
                primary = config && supported('youtube')
                    ? { query: identifier, source: 'ytrec' }
                    : youtubeMix(identifier, source === 'youtubemusic');
            } else if ((source === 'spotify' || source === 'deezer' || source === 'tidal') && supported(source)) {
                primary = providerRecommendation(source, identifier);
            // Apple Music currently has no native amrec contract on the pinned NodeLink revision.
            // Use the existing fallback instead of an invented recommendation prefix.
            } else if (source === 'soundcloud' && author && !isDisabled('soundcloud')) {
                primary = { query: author, source: 'soundcloud' };
            }
            if (!primary && queryText && source !== 'youtube' && !isDisabled('youtube')) {
                const seeds = await search({ query: queryText, source: 'youtube' });
                const seed = seeds.map(recommendationInfo).find(candidate =>
                    (candidate.sourceName?.toLowerCase() === 'youtube' || candidate.sourceName?.toLowerCase() === 'youtubemusic') &&
                    typeof candidate.identifier === 'string' && validYouTubeId(candidate.identifier));
                if (seed?.identifier) primary = youtubeMix(seed.identifier);
            }
            const groups: Track[][] = [];
            const collect = async (query: Pick<ISearchQuery, 'query' | 'source'>) => {
                try { groups.push((await search(query)).slice(0, 50)); }
                catch (error) {
                    if (signal.aborted || !config) throw error;
                    node.manager.emit('debug', 'NyxLink > RecommendationResolver > Provider lookup failed.');
                }
            };
            if (primary) {
                await collect(primary);
                if (primary.source === 'ytrec' && active() && !signal.aborted && groups.every(group => !group.length)) {
                    await collect(youtubeMix(identifier, source === 'youtubemusic'));
                }
            }
            // Opt-in additional providers; never fabricate IDs from a different catalogue.
            for (const provider of config?.providers ?? []) {
                if (!active() || signal.aborted) break;
                if (!queryText || provider === source || !supported(provider)) continue;
                try {
                    const seeds = await search({ query: queryText, source: providerSearch[provider] });
                    const seed = seeds.slice(0, 50).find(candidate => matchesRecommendationSeed(track, candidate, provider));
                    const id = seed && recommendationInfo(seed).identifier;
                    const query = id ? providerRecommendation(provider, id) : undefined;
                    if (query) await collect(query);
                } catch {
                    if (signal.aborted) break;
                    node.manager.emit('debug', 'NyxLink > RecommendationResolver > Additional provider lookup failed.');
                }
            }
            if (!active() || signal.aborted) return;
            const historyLimit = node.manager.options.queue?.historyLimit ?? player.historySize ?? 10;
            const previous = Array.isArray(player.previous) && historyLimit > 0 ? player.previous.slice(-historyLimit) : [];
            const queued = Array.isArray(player.queue?.tracks) ? player.queue.tracks : [];
            const seen = new Set([track, ...previous, ...queued].filter(Boolean).flatMap(recommendationKeys));
            const selected: Track[] = [];
            // Interleave provider lists so the primary provider cannot occupy every
            // candidate slot before additional providers reach the preference scorer.
            const uniqueGroups = groups.map(group => group.filter(candidate => {
                if (!candidate || !candidate.encoded || isDisabled(recommendationInfo(candidate).sourceName?.toLowerCase() ?? '')) return false;
                const keys = recommendationKeys(candidate);
                if (!keys.length || keys.some(key => seen.has(key))) return false;
                keys.forEach(key => seen.add(key));
                return true;
            }));
            const limit = config?.maxCandidates ?? 50;
            for (let index = 0; index < 50 && selected.length < limit; index++) {
                for (const group of uniqueGroups) {
                    if (group[index]) selected.push(group[index]);
                    if (selected.length >= limit) break;
                }
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
