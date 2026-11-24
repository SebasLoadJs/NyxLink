import { types } from 'node:util';

/** Copy a fixed set of own data properties only. Accessors, proxies and
 * inherited fields are not trusted evidence. No arbitrary traversal. */
export function observedFields(input: unknown, keys: readonly string[]): Record<string, unknown> {
    const result: Record<string, unknown> = Object.create(null);
    if (!input || typeof input !== 'object' || types.isProxy(input)) return result;
    for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (descriptor && 'value' in descriptor) result[key] = descriptor.value;
    }
    return result;
}
