/** Native NodeLink discovery syntax. Results can represent non-playable entities. */
export const nodeLinkDiscoveryTypes = ['track', 'album', 'artist', 'playlist', 'channel', 'user'] as const;
export type NodeLinkDiscoveryType = typeof nodeLinkDiscoveryTypes[number];

export interface NodeLinkDiscoveryOptions {
    source?: string;
    type?: NodeLinkDiscoveryType;
    timeoutMs?: number;
    signal?: AbortSignal;
}

/** Build a wire identifier without interpolating arbitrary prefix modifiers. */
export function nodeLinkDiscoveryIdentifier(query: string, options: NodeLinkDiscoveryOptions = {}): string {
    if (typeof query !== 'string' || !query.trim() || query.length > 4096) {
        throw new TypeError('NodeLink discovery requires a nonempty query of at most 4096 characters');
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Invalid discovery options');
    const source = options.source ?? 'search';
    if (typeof source !== 'string' || !/^(?:search|[a-z][a-z0-9]{0,31}search)$/.test(source)) {
        throw new TypeError('Invalid NodeLink discovery prefix');
    }
    const type = options.type;
    if (type !== undefined && !nodeLinkDiscoveryTypes.includes(type)) throw new TypeError('Invalid NodeLink discovery type');
    const timeout = options.timeoutMs;
    if (timeout !== undefined && (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000)) {
        throw new TypeError('Invalid NodeLink discovery timeout');
    }
    return type === undefined ? `${source}:${query}` : `${source}:${type}:${query}`;
}
