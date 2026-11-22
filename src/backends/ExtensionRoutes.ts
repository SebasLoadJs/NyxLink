import type { BackendKind } from './BackendAdapter';
import { FeatureUnavailableError } from '../errors/FeatureUnavailableError';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type RouteDefinition = Readonly<{ feature: string; method: Method; path: string; transport: 'json' | 'stream' }>;
const player = '/v4/sessions/:sessionId/players/:guildId';
const definitions = {
    'mix:add': { feature: 'mix:add', method: 'POST', path: player + '/mix', transport: 'json' },
    'mix:list': { feature: 'mix:list', method: 'GET', path: player + '/mix', transport: 'json' },
    'mix:update': { feature: 'mix:update', method: 'PATCH', path: player + '/mix/:mixId', transport: 'json' },
    'mix:remove': { feature: 'mix:remove', method: 'DELETE', path: player + '/mix/:mixId', transport: 'json' },
    lyrics: { feature: 'lyrics', method: 'GET', path: '/v4/loadlyrics', transport: 'json' },
    'source-health': { feature: 'source-health', method: 'GET', path: '/v4/sources/health', transport: 'json' },
    chapters: { feature: 'chapters', method: 'GET', path: '/v4/loadchapters', transport: 'json' },
    meaning: { feature: 'meaning', method: 'GET', path: '/v4/meaning', transport: 'json' },
    connection: { feature: 'connection', method: 'GET', path: '/v4/connection', transport: 'json' },
    metrics: { feature: 'metrics', method: 'GET', path: '/v4/metrics', transport: 'json' },
    'workers:get': { feature: 'workers:get', method: 'GET', path: '/v4/workers', transport: 'json' },
    'workers:patch': { feature: 'workers:patch', method: 'PATCH', path: '/v4/workers', transport: 'json' },
    'youtube:config:get': { feature: 'youtube:config', method: 'GET', path: '/v4/youtube/config', transport: 'json' },
    'youtube:config:update': { feature: 'youtube:config', method: 'PATCH', path: '/v4/youtube/config', transport: 'json' },
    'youtube:oauth': { feature: 'youtube:oauth', method: 'GET', path: '/v4/youtube/oauth', transport: 'json' },
    encodetrack: { feature: 'encodetrack', method: 'GET', path: '/v4/encodetrack', transport: 'json' },
    encodedtracks: { feature: 'encodedtracks', method: 'POST', path: '/v4/encodedtracks', transport: 'json' },
    trackstream: { feature: 'trackstream', method: 'GET', path: '/v4/trackstream', transport: 'json' },
    loadstream: { feature: 'loadstream', method: 'POST', path: '/v4/loadstream', transport: 'stream' },
    'lyrics:subscribe': { feature: 'lyrics:subscribe', method: 'POST', path: player + '/lyrics/subscribe', transport: 'json' },
    'lyrics:unsubscribe': { feature: 'lyrics:unsubscribe', method: 'DELETE', path: player + '/lyrics/subscribe', transport: 'json' },
} as const satisfies Record<string, RouteDefinition>;

export type ExtensionOperation = keyof typeof definitions;
export type ExtensionRoute = RouteDefinition;
export type ExtensionRouteParameters = { sessionId?: string; guildId?: string; mixId?: string; query?: URLSearchParams };

/** A deliberately closed catalog: no arbitrary URL or inferred Lavalink plugin routes. */
export function resolveExtensionRoute(backend: BackendKind | 'unknown', operation: ExtensionOperation,
    params: ExtensionRouteParameters = {}, unavailable?: (feature: string) => boolean): ExtensionRoute {
    if (!Object.hasOwn(definitions, operation)) throw new TypeError('Unknown extension operation');
    const route = definitions[operation];
    if (backend !== 'nodelink' || unavailable?.(route.feature)) throw new FeatureUnavailableError(route.feature, backend);
    const path = route.path.replace(/:(sessionId|guildId|mixId)/g, (_, key: 'sessionId' | 'guildId' | 'mixId') => {
        const value = params[key];
        if (typeof value !== 'string' || !value || value === '.' || value === '..') throw new TypeError(`Missing or invalid extension route parameter: ${key}`);
        return encodeURIComponent(value);
    });
    const query = params.query?.toString();
    return { ...route, path: query ? `${path}?${query}` : path };
}
