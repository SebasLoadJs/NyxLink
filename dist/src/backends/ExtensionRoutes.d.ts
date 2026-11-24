import type { BackendKind } from './BackendAdapter';
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type RouteDefinition = Readonly<{
    feature: string;
    method: Method;
    path: string;
    transport: 'json' | 'stream';
}>;
declare const definitions: {
    readonly 'groups:list': {
        readonly feature: "groups";
        readonly method: "GET";
        readonly path: "/v4/sessions/:sessionId/groups";
        readonly transport: "json";
    };
    readonly 'groups:get': {
        readonly feature: "groups";
        readonly method: "GET";
        readonly path: string;
        readonly transport: "json";
    };
    readonly 'groups:create': {
        readonly feature: "groups";
        readonly method: "POST";
        readonly path: "/v4/sessions/:sessionId/groups";
        readonly transport: "json";
    };
    readonly 'groups:update': {
        readonly feature: "groups";
        readonly method: "PATCH";
        readonly path: string;
        readonly transport: "json";
    };
    readonly 'groups:delete': {
        readonly feature: "groups";
        readonly method: "DELETE";
        readonly path: string;
        readonly transport: "json";
    };
    readonly 'sponsorblock:get': {
        readonly feature: "sponsorblock";
        readonly method: "GET";
        readonly path: string;
        readonly transport: "json";
    };
    readonly 'sponsorblock:update': {
        readonly feature: "sponsorblock";
        readonly method: "PATCH";
        readonly path: string;
        readonly transport: "json";
    };
    readonly 'sponsorblock:segments': {
        readonly feature: "sponsorblock";
        readonly method: "POST";
        readonly path: string;
        readonly transport: "json";
    };
    readonly 'sponsorblock:clear': {
        readonly feature: "sponsorblock";
        readonly method: "DELETE";
        readonly path: string;
        readonly transport: "json";
    };
    readonly 'mix:add': {
        readonly feature: "mix:add";
        readonly method: "POST";
        readonly path: string;
        readonly transport: "json";
    };
    readonly 'mix:list': {
        readonly feature: "mix:list";
        readonly method: "GET";
        readonly path: string;
        readonly transport: "json";
    };
    readonly 'mix:update': {
        readonly feature: "mix:update";
        readonly method: "PATCH";
        readonly path: string;
        readonly transport: "json";
    };
    readonly 'mix:remove': {
        readonly feature: "mix:remove";
        readonly method: "DELETE";
        readonly path: string;
        readonly transport: "json";
    };
    readonly lyrics: {
        readonly feature: "lyrics";
        readonly method: "GET";
        readonly path: "/v4/loadlyrics";
        readonly transport: "json";
    };
    readonly 'source-health': {
        readonly feature: "source-health";
        readonly method: "GET";
        readonly path: "/v4/sources/health";
        readonly transport: "json";
    };
    readonly chapters: {
        readonly feature: "chapters";
        readonly method: "GET";
        readonly path: "/v4/loadchapters";
        readonly transport: "json";
    };
    readonly meaning: {
        readonly feature: "meaning";
        readonly method: "GET";
        readonly path: "/v4/meaning";
        readonly transport: "json";
    };
    readonly connection: {
        readonly feature: "connection";
        readonly method: "GET";
        readonly path: "/v4/connection";
        readonly transport: "json";
    };
    readonly metrics: {
        readonly feature: "metrics";
        readonly method: "GET";
        readonly path: "/v4/metrics";
        readonly transport: "json";
    };
    readonly 'workers:get': {
        readonly feature: "workers:get";
        readonly method: "GET";
        readonly path: "/v4/workers";
        readonly transport: "json";
    };
    readonly 'workers:patch': {
        readonly feature: "workers:patch";
        readonly method: "PATCH";
        readonly path: "/v4/workers";
        readonly transport: "json";
    };
    readonly 'youtube:config:get': {
        readonly feature: "youtube:config";
        readonly method: "GET";
        readonly path: "/v4/youtube/config";
        readonly transport: "json";
    };
    readonly 'youtube:config:update': {
        readonly feature: "youtube:config";
        readonly method: "PATCH";
        readonly path: "/v4/youtube/config";
        readonly transport: "json";
    };
    readonly 'youtube:oauth': {
        readonly feature: "youtube:oauth";
        readonly method: "GET";
        readonly path: "/v4/youtube/oauth";
        readonly transport: "json";
    };
    readonly encodetrack: {
        readonly feature: "encodetrack";
        readonly method: "GET";
        readonly path: "/v4/encodetrack";
        readonly transport: "json";
    };
    readonly encodedtracks: {
        readonly feature: "encodedtracks";
        readonly method: "POST";
        readonly path: "/v4/encodedtracks";
        readonly transport: "json";
    };
    readonly trackstream: {
        readonly feature: "trackstream";
        readonly method: "GET";
        readonly path: "/v4/trackstream";
        readonly transport: "json";
    };
    readonly loadstream: {
        readonly feature: "loadstream";
        readonly method: "POST";
        readonly path: "/v4/loadstream";
        readonly transport: "stream";
    };
    readonly 'lyrics:subscribe': {
        readonly feature: "lyrics:subscribe";
        readonly method: "POST";
        readonly path: string;
        readonly transport: "json";
    };
    readonly 'lyrics:unsubscribe': {
        readonly feature: "lyrics:unsubscribe";
        readonly method: "DELETE";
        readonly path: string;
        readonly transport: "json";
    };
};
export type ExtensionOperation = keyof typeof definitions;
export type ExtensionRoute = RouteDefinition;
export type ExtensionRouteParameters = {
    sessionId?: string;
    guildId?: string;
    mixId?: string;
    groupId?: string;
    query?: URLSearchParams;
};
export declare function resolveExtensionRoute(backend: BackendKind | 'unknown', operation: ExtensionOperation, params?: ExtensionRouteParameters, unavailable?: (feature: string) => boolean): ExtensionRoute;
export {};
