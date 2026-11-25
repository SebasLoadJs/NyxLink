import { sourcePrefix, sourceProvider, requiresNodeLink, disabledSource } from './SourceRouting';
import type { Manager } from '../core/Manager';
import { validateLoadResponse } from '../backends/ProtocolValidation';
import type { Node } from '../entities/Node';
import type { SearchResult } from '../structures/SearchResult';
import type { IRESTLoadTracks, ISearchQuery } from '../typings/Interfaces';
import { Structure, nodeLinkSources } from '../Util';
import { SharedSearchRequests } from './SharedSearchRequests';

/** Coordinates backend search policy; cache is opt-in, bounded and local to this manager. */
export class SearchService {
    private readonly cache = new Map<string, { expires: number; value: IRESTLoadTracks }>();
    // Cache ownership is per Node instance, not host:port or a reusable
    // identifier. Nodes with the same endpoint can serve different sessions.
    private readonly cacheNodeIds = new WeakMap<Node, number>();
    private nextCacheNodeId = 0;
    private readonly pending = new Set<AbortController>();
    private readonly shared = new SharedSearchRequests<IRESTLoadTracks>();
    constructor(private readonly manager: Manager, private readonly native: (query: ISearchQuery) => Promise<IRESTLoadTracks | null>) {}

    public close(): void {
        this.cache.clear();
        this.shared.close();
        for (const operation of this.pending) operation.abort(new Error('Manager is shut down'));
        this.pending.clear();
    }

    private async wait<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
        return new Promise((resolve, reject) => {
            const aborted = () => { cleanup(); reject(signal.reason ?? new Error('Search aborted')); };
            const cleanup = () => signal.removeEventListener('abort', aborted);
            signal.addEventListener('abort', aborted, { once: true });
            operation.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
            if (signal.aborted) aborted();
        });
    }

    private present(response: IRESTLoadTracks, query: ISearchQuery, node?: Node): SearchResult {
        validateLoadResponse(response);
        const result: SearchResult = new (Structure.get('SearchResult'))(response, query.requester, this.manager.options.search?.playlistLoadLimit, this.manager.options.trackPartial ?? []);
        if (result.loadType === 'search') result.tracks = result.tracks.slice(0, this.manager.options.search?.resultLimit ?? 10);
        const disabled = this.manager.options.sources?.disabledSources ?? [];
        result.tracks = result.tracks.filter(track => !disabledSource(track.getInfo().sourceName, disabled));
        for (const track of result.tracks) track.backend = node?.backend?.kind;
        return result;
    }

    public async search(query: ISearchQuery): Promise<SearchResult> {
        return this.runSearch(query);
    }

    private async runSearch(query: ISearchQuery): Promise<SearchResult> {
        if (this.manager.destroyed) throw new Error('Manager is shut down');
        if (!query || typeof query !== 'object' || Array.isArray(query)) throw new TypeError('Search options must be an object');
        if (typeof query.query !== 'string' || !query.query.trim()) throw new TypeError('Search query must be a non-empty string');
        if (query.source !== undefined && typeof query.source !== 'string') throw new TypeError('Search source must be a string');
        const timeoutMs = this.manager.options.search?.timeoutMs ?? 10000;
        if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new TypeError("Search timeoutMs must be 1..120000");
        const controller = new AbortController();
        const signal = query.signal ? AbortSignal.any([controller.signal, query.signal]) : controller.signal;
        signal.throwIfAborted();
        const timer = setTimeout(() => controller.abort(Object.assign(new Error("Search timed out"), { code: "ETIMEDOUT" })), timeoutMs);
        this.pending.add(controller);
        try {
            const disabled = this.manager.options.sources?.disabledSources ?? [];
            const requested = query.source ?? this.manager.options.search?.defaultPlatform ?? 'youtube';
            let isUrl = false;
            try { const url = new URL(query.query); isUrl = url.protocol === 'http:' || url.protocol === 'https:'; } catch {}
            if ((query.source !== undefined || !isUrl) && disabledSource(requested, disabled)) {
                throw new Error('Requested search source is disabled');
            }
            // An explicit node is a backend routing instruction, not a suggestion to use a local provider.
            const native = query.node ? null : await this.wait(this.native({ ...query, signal }), signal);
            if (native) {
                const result = this.present(native, query);
                this.manager.emit('debug', `NyxLink > Manager <- Native source result. LoadType: ${native.loadType}`);
                return result;
            }
            const options = this.manager.options.search ?? {};
            if (options.deduplicate !== undefined && typeof options.deduplicate !== 'boolean') throw new TypeError('Search deduplicate must be boolean');
            const sourceHealth = options.sourceHealth;
            if (sourceHealth !== undefined && (typeof sourceHealth !== 'boolean')) throw new TypeError('Invalid search sourceHealth option');
            const source = sourcePrefix(requested);
            const preferSource = sourceHealth && !isUrl ? sourceProvider(source) : undefined;
            const exclusive = !isUrl && requiresNodeLink(source);
            const node = query.node ? this.manager.nodes.nodes.get(query.node) :
                this.manager.nodes.findNode({ preferSource, ...(exclusive ? { backend: 'nodelink' as const } : {}) });
            if (!node || node.destroyed || !node.connected) throw new Error('No available nodes for searching');
            // Search responses are tied to the selected node and its session.
            // A late response must not advertise tracks from a node that has
            // disconnected, rotated sessions, or been replaced under the same ID.
            const searchSession = node.sessionId;
            const searchBackend = node.backend;
            const assertCurrentNode = (): void => {
                signal.throwIfAborted();
                if (this.manager.destroyed || node.destroyed || !node.connected ||
                    this.manager.nodes.nodes.get(node.identifier) !== node ||
                    node.sessionId !== searchSession || node.backend !== searchBackend) {
                    throw new Error('Search node changed while the request was pending');
                }
            };
            const fallback = options.fallbackPlatforms ?? [];
            if (!Array.isArray(fallback) || fallback.length > 3 || fallback.some(source => typeof source !== 'string' || !source)) throw new TypeError('Search fallbackPlatforms requires at most three source names');
            const platforms = isUrl ? [''] : [...new Set([source, ...fallback.map(sourcePrefix)])].filter(platform => !disabledSource(platform, disabled));
            const settings = options.cache;
            const ttl = settings?.ttlMs ?? 0;
            const capacity = settings?.maxEntries ?? 100;
            if (settings && (!Number.isFinite(ttl) || ttl <= 0 || ttl > 3600000 || !Number.isInteger(capacity) || capacity < 1 || capacity > 1000)) throw new TypeError('Search cache requires ttlMs 1..3600000 and maxEntries 1..1000');
            let nodeId = this.cacheNodeIds.get(node);
            if (nodeId === undefined) {
                nodeId = ++this.nextCacheNodeId;
                this.cacheNodeIds.set(node, nodeId);
            }
            const key = JSON.stringify([nodeId, node.sessionId, node.backend?.kind, node.backend?.version, query.query, platforms]);
            const cached = this.cache.get(key);
            if (ttl && !options.resolver && cached && cached.expires > Date.now()) {
                assertCurrentNode();
                this.cache.delete(key); this.cache.set(key, cached);
                return this.present(structuredClone(cached.value), query, node);
            }
            this.cache.delete(key);
            const custom = options.resolver ? await this.wait(Promise.resolve().then(() => options.resolver!({ ...query, signal }, node)), signal) : null;
            const load = async (activeSignal: AbortSignal): Promise<IRESTLoadTracks> => {
                let response: IRESTLoadTracks = { loadType: 'empty', data: {} };
                for (const platform of platforms) {
                    activeSignal.throwIfAborted();
                    if (nodeLinkSources.has(platform) || requiresNodeLink(platform) || platform === 'sprec') {
                        // LavaSrc advertises the same prefix for these sources. Keep the native
                        // NodeLink gate for every other extension and for unverified plugins.
                        const shared = { spsearch: 'spotify', sprec: 'spotify', amsearch: 'applemusic', dzsearch: 'deezer', tdsearch: 'tidal' } as const;
                        const provider = Object.hasOwn(shared, platform) ? shared[platform as keyof typeof shared] : undefined;
                        const lavaSrc = node.backend?.kind === 'lavalink' && provider !== undefined &&
                            node.backend.plugins.some(plugin => ['lavasrc', 'lavasrc-plugin'].includes(plugin.name.toLowerCase())) &&
                            node.backend.supports(`source:${provider}`);
                        if (!lavaSrc) node.assertFeature(`search:${platform}`);
                    }
                    const identifier = isUrl ? query.query : `${platform}:${query.query}`;
                    response = await this.wait(node.rest.loadTracks(identifier, { timeoutMs, signal: activeSignal }), activeSignal);
                    validateLoadResponse(response);
                    // An upstream error is not an empty search. Never bypass provider rejection by falling back.
                    if (response.loadType !== 'empty' && !(response.loadType === 'search' && response.data.length === 0)) break;
                }
                return response;
            };
            const response = custom ?? (options.deduplicate && !options.resolver
                ? structuredClone(await this.shared.run(key, signal, load)) : await load(signal));
            assertCurrentNode();
            validateLoadResponse(response);
            if (ttl && !options.resolver && !['empty', 'error'].includes(response.loadType)) {
                try {
                    const value = structuredClone(response);
                    const tracks = value.loadType === 'track' ? [value.data] : value.loadType === 'search' ? value.data : value.data.tracks;
                    for (const track of tracks ?? []) if (track.userData) delete track.userData.requester;
                    for (const [entry, cached] of this.cache) if (cached.expires <= Date.now()) this.cache.delete(entry);
                    while (this.cache.size >= capacity) {
                        const oldest = this.cache.keys().next();
                        if (oldest.done) break;
                        this.cache.delete(oldest.value);
                    }
                    this.cache.set(key, { expires: Date.now() + ttl, value });
                } catch { /* Non-JSON custom plugin metadata is returned without caching. */ }
            }
            assertCurrentNode();
            this.manager.emit('debug', `NyxLink > Manager <- Search result. LoadType: ${response.loadType}`);
            return this.present(response, query, node);
        } finally { clearTimeout(timer); this.pending.delete(controller); }
    }
}
