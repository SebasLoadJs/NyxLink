import type { BackendKind } from './BackendAdapter';

/** A trusted application declares a fixed server plugin endpoint, not a URL supplied by a user. */
export type BackendPluginMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface BackendPluginRoute<T> {
    readonly backend: BackendKind;
    readonly plugin: string;
    readonly id: string;
    readonly scope: 'node' | 'player';
    readonly method: BackendPluginMethod;
    readonly path: string;
    readonly decode: (response: unknown) => T;
}
export interface BackendPluginRequest {
    guildId?: string;
    query?: URLSearchParams;
    body?: Record<string, unknown>;
    timeoutMs?: number;
    signal?: AbortSignal;
}
const identifier = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const segment = /^[a-zA-Z0-9_-]{1,64}$/;
const reserved = new Set(['sessions','info','stats','version','loadtracks','decodetrack','decodetracks','encodetrack','encodedtracks','routeplanner','connection','workers','youtube','metrics','profiler','hls','loadstream','trackstream','sources','loadlyrics','loadchapters','meaning','loadmedia','loadsearch','lyrics','sponsorblock','mix','websocket']);
const key = (route: BackendPluginRoute<unknown>) => route.backend + ':' + route.plugin + ':' + route.id;
export class BackendPluginRouteRegistry {
    private readonly routes = new Map<string, BackendPluginRoute<unknown>>();
    private closed = false;

    public register<T>(definition: BackendPluginRoute<T>): BackendPluginRoute<T> {
        if (this.closed) throw new Error('Backend plugin registry is closed');
        if (!definition || !['lavalink','nodelink'].includes(definition.backend) ||
            typeof definition.plugin !== 'string' || typeof definition.id !== 'string' ||
            !identifier.test(definition.plugin) || !identifier.test(definition.id) ||
            !['node','player'].includes(definition.scope) ||
            !['GET','POST','PUT','PATCH','DELETE'].includes(definition.method) ||
            typeof definition.decode !== 'function' || typeof definition.path !== 'string') throw new TypeError('Invalid backend plugin route');
        // Paths are relative to the node or current player. No URL, escapes,
        // dot segments, variables, or overrides of built-in routes.
        const parts = definition.path.split('/');
        if (parts.length > 8 || !parts.every(part => segment.test(part)) ||
            reserved.has(parts[0].toLowerCase()) ||
            (parts[0].toLowerCase() === 'plugins' && parts[1]?.toLowerCase() !== definition.plugin)) {
            throw new TypeError('Invalid or reserved backend plugin path');
        }
        const route: BackendPluginRoute<T> = Object.freeze({
            backend: definition.backend, plugin: definition.plugin, id: definition.id,
            scope: definition.scope, method: definition.method, path: definition.path,
            decode: definition.decode,
        });
        if (this.routes.has(key(route))) throw new Error('Backend plugin route already registered');
        if (this.routes.size >= 256) throw new Error('Backend plugin route limit reached');
        this.routes.set(key(route), route);
        return route;
    }

    public owns(route: BackendPluginRoute<unknown>): boolean {
        return !this.closed && !!route && this.routes.get(key(route)) === route;
    }

    public remove(route: BackendPluginRoute<unknown>): boolean {
        return this.owns(route) && this.routes.delete(key(route));
    }

    public list(): Omit<BackendPluginRoute<unknown>, 'decode'>[] {
        return [...this.routes.values()].map(({decode: _decode, ...metadata}) => metadata);
    }

    public close(): void {
        this.closed = true;
        this.routes.clear();
    }
}
