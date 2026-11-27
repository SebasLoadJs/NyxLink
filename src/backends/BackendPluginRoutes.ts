import type { BackendKind } from './BackendAdapter';

/** A trusted application declares a fixed server plugin endpoint, not a URL supplied by a user. */
export type BackendPluginMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface BackendPluginBinaryOptions {
    readonly contentTypes: readonly string[];
    readonly maxBytes?: number;
}

export interface BackendPluginBinaryResponse {
    readonly bytes: Buffer;
    readonly contentType: string;
    readonly statusCode: number;
}

export interface BackendPluginRoute<T> {
    readonly backend: BackendKind;
    readonly plugin: string;
    readonly id: string;
    readonly scope: 'node' | 'player';
    readonly method: BackendPluginMethod;
    readonly path: string;
    readonly prefix?: 'v4' | 'root';
    readonly binary?: BackendPluginBinaryOptions;
    readonly decode: (response: unknown) => T;
}
export interface BackendPluginRequest {
    guildId?: string;
    params?: Readonly<Record<string, string>>;
    query?: URLSearchParams;
    body?: Record<string, unknown>;
    timeoutMs?: number;
    signal?: AbortSignal;
}
const identifier = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const segment = /^[a-zA-Z0-9_-]{1,64}$/;
const parameter = /^:([a-zA-Z][a-zA-Z0-9_]{0,31})$/;
const parameterValue = /^[a-zA-Z0-9_-]{1,128}$/;
const reserved = new Set(['sessions','players','groups','track','info','stats','version','loadtracks','decodetrack','decodetracks','encodetrack','encodedtracks','routeplanner','connection','workers','youtube','metrics','profiler','hls','loadstream','trackstream','sources','loadlyrics','loadchapters','meaning','loadmedia','loadsearch','lyrics','sponsorblock','mix','websocket']);
const mimePattern = /^(?:audio|video|image|application)\/[a-z0-9][a-z0-9.+_-]{0,63}$/;
function binaryOptions(value: BackendPluginBinaryOptions | undefined): BackendPluginBinaryOptions | undefined {
    if (value === undefined) return undefined;
    if (!value || !Array.isArray(value.contentTypes) || value.contentTypes.length < 1 || value.contentTypes.length > 16 ||
        !value.contentTypes.every(type => typeof type === 'string' && mimePattern.test(type) && !['application/json','application/javascript','application/xhtml+xml','image/svg+xml'].includes(type)) ||
        new Set(value.contentTypes).size !== value.contentTypes.length) throw new TypeError('Invalid binary plugin content types');
    const maxBytes = value.maxBytes ?? 4194304;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16777216) throw new TypeError('Invalid binary plugin response limit');
    return Object.freeze({contentTypes:Object.freeze([...value.contentTypes]),maxBytes});
}
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
        // Dynamic segments are allowed only after a literal namespace. They are
        // never URL fragments, and cannot select a built-in route or another plugin.
        const parts = definition.path.split('/');
        const root = parts[0].toLowerCase();
        const params = parts.filter(part => parameter.test(part));
        const prefix = definition.prefix ?? 'v4';
        if (!['v4','root'].includes(prefix) || (prefix === 'root' && definition.scope !== 'node') ||
            parts.length > 8 || !segment.test(parts[0]) ||
            !parts.every(part => segment.test(part) || parameter.test(part)) ||
            new Set(params).size !== params.length || reserved.has(root) || /^v\d+$/.test(root) ||
            (root === 'plugins' && parts[1]?.toLowerCase() !== definition.plugin) ||
            (prefix === 'root' && root !== 'plugins' && root !== definition.plugin)) {
            throw new TypeError('Invalid or reserved backend plugin path');
        }
        const binary = binaryOptions(definition.binary);
        const route: BackendPluginRoute<T> = Object.freeze({
            backend: definition.backend, plugin: definition.plugin, id: definition.id,
            scope: definition.scope, method: definition.method, path: definition.path,
            ...(definition.prefix === undefined ? {} : { prefix }),
            ...(binary === undefined ? {} : {binary}),
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

/** Render only a registered path template; every dynamic value is one safe segment. */
export function renderBackendPluginPath(route: BackendPluginRoute<unknown>, values?: Readonly<Record<string, string>>): string {
    if (values !== undefined && (!values || typeof values !== 'object' || Array.isArray(values))) throw new TypeError('Invalid plugin route parameters');
    const expected = route.path.split('/').filter(part => parameter.test(part)).map(part => part.slice(1));
    const actual = Object.keys(values ?? {});
    if (actual.length !== expected.length || actual.some(key => !expected.includes(key))) throw new TypeError('Invalid plugin route parameters');
    return route.path.split('/').map(part => {
        if (!parameter.test(part)) return part;
        const key = part.slice(1);
        if (!values || !Object.hasOwn(values, key)) throw new TypeError('Missing plugin route parameter');
        const value = values[key];
        if (typeof value !== 'string' || !parameterValue.test(value)) throw new TypeError('Invalid plugin route parameter');
        return value;
    }).join('/');
}
