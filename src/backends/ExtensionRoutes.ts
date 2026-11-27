import type { BackendKind } from './BackendAdapter';
import { FeatureUnavailableError } from '../errors/FeatureUnavailableError';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type RouteDefinition = Readonly<{ feature: string; method: Method; path: string; transport: 'json' | 'stream' }>;
const player = '/v4/sessions/:sessionId/players/:guildId';
const groups = '/v4/sessions/:sessionId/groups';
const sponsor = player + '/sponsorblock';
const definitions = {
    'groups:list': { feature: 'groups', method: 'GET', path: groups, transport: 'json' },
    'groups:get': { feature: 'groups', method: 'GET', path: groups + '/:groupId', transport: 'json' },
    'groups:create': { feature: 'groups', method: 'POST', path: groups, transport: 'json' },
    'groups:update': { feature: 'groups', method: 'PATCH', path: groups + '/:groupId', transport: 'json' },
    'groups:delete': { feature: 'groups', method: 'DELETE', path: groups + '/:groupId', transport: 'json' },
    'sponsorblock:get': { feature: 'sponsorblock', method: 'GET', path: sponsor, transport: 'json' },
    'sponsorblock:update': { feature: 'sponsorblock', method: 'PATCH', path: sponsor, transport: 'json' },
    'sponsorblock:segments': { feature: 'sponsorblock', method: 'POST', path: sponsor, transport: 'json' },
    'sponsorblock:clear': { feature: 'sponsorblock', method: 'DELETE', path: sponsor, transport: 'json' },
    'mix:add': { feature: 'mix:add', method: 'POST', path: player + '/mix', transport: 'json' },
    'mix:list': { feature: 'mix:list', method: 'GET', path: player + '/mix', transport: 'json' },
    'mix:update': { feature: 'mix:update', method: 'PATCH', path: player + '/mix/:mixId', transport: 'json' },
    'mix:remove': { feature: 'mix:remove', method: 'DELETE', path: player + '/mix/:mixId', transport: 'json' },
    'hls:playlist': { feature: 'hls', method: 'GET', path: '/v4/hls/playlist.m3u8', transport: 'stream' },
    'hls:init': { feature: 'hls', method: 'GET', path: '/v4/hls/init.mp4', transport: 'stream' },
    'hls:segment': { feature: 'hls', method: 'GET', path: '/v4/hls/segment.m4s', transport: 'stream' },
    loadmedia: { feature: 'loadmedia', method: 'GET', path: '/v4/loadmedia', transport: 'json' },
    lyrics: { feature: 'lyrics', method: 'GET', path: '/v4/loadlyrics', transport: 'json' },
    'source-health': { feature: 'source-health', method: 'GET', path: '/v4/sources/health', transport: 'json' },
    chapters: { feature: 'chapters', method: 'GET', path: '/v4/loadchapters', transport: 'json' },
    meaning: { feature: 'meaning', method: 'GET', path: '/v4/meaning', transport: 'json' },
    connection: { feature: 'connection', method: 'GET', path: '/v4/connection', transport: 'json' },
    metrics: { feature: 'metrics', method: 'GET', path: '/v4/metrics', transport: 'json' },
    'profiler:status': { feature: 'profiler:status', method: 'GET', path: '/v4/profiler', transport: 'json' },
    'profiler:command': { feature: 'profiler:command', method: 'POST', path: '/v4/profiler', transport: 'json' },
    'workers:get': { feature: 'workers:get', method: 'GET', path: '/v4/workers', transport: 'json' },
    'workers:patch': { feature: 'workers:patch', method: 'PATCH', path: '/v4/workers', transport: 'json' },
    'youtube:config:get': { feature: 'youtube:config', method: 'GET', path: '/v4/youtube/config', transport: 'json' },
    'youtube:config:update': { feature: 'youtube:config', method: 'PATCH', path: '/v4/youtube/config', transport: 'json' },
    'youtube:oauth': { feature: 'youtube:oauth', method: 'POST', path: '/v4/youtube/oauth', transport: 'json' },
    encodetrack: { feature: 'encodetrack', method: 'GET', path: '/v4/encodetrack', transport: 'json' },
    encodedtracks: { feature: 'encodedtracks', method: 'POST', path: '/v4/encodedtracks', transport: 'json' },
    trackstream: { feature: 'trackstream', method: 'GET', path: '/v4/trackstream', transport: 'json' },
    loadstream: { feature: 'loadstream', method: 'POST', path: '/v4/loadstream', transport: 'stream' },
    'lyrics:subscribe': { feature: 'lyrics:subscribe', method: 'POST', path: player + '/lyrics/subscribe', transport: 'json' },
    'lyrics:unsubscribe': { feature: 'lyrics:unsubscribe', method: 'DELETE', path: player + '/lyrics/subscribe', transport: 'json' },
} as const satisfies Record<string, RouteDefinition>;

/** Native NodeLink feature keys, derived from the actual route catalog. */
export const nodeLinkExtensionFeatures: readonly string[] = Object.freeze(
    [...new Set(Object.values(definitions).map(route => route.feature))]
);
export type ExtensionOperation = keyof typeof definitions;
export type ExtensionRoute = RouteDefinition;
export type ExtensionRouteParameters = { sessionId?: string; guildId?: string; mixId?: string; groupId?: string; query?: URLSearchParams };

/** A deliberately closed catalog: no arbitrary URL or inferred Lavalink plugin routes. */
export function resolveExtensionRoute(backend: BackendKind | 'unknown', operation: ExtensionOperation,
    params: ExtensionRouteParameters = {}, unavailable?: (feature: string) => boolean): ExtensionRoute {
    if (!Object.hasOwn(definitions, operation)) throw new TypeError('Unknown extension operation');
    const route = definitions[operation];
    if (backend !== 'nodelink' || unavailable?.(route.feature)) throw new FeatureUnavailableError(route.feature, backend);
    const path = route.path.replace(/:(sessionId|guildId|mixId|groupId)/g, (_, key: 'sessionId' | 'guildId' | 'mixId' | 'groupId') => {
        const value = params[key];
        if (typeof value !== 'string' || !value || value === '.' || value === '..') throw new TypeError(`Missing or invalid extension route parameter: ${key}`);
        return encodeURIComponent(value);
    });
    const query = params.query?.toString();
    return { ...route, path: query ? `${path}?${query}` : path };
}
