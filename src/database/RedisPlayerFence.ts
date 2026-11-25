import type { RedisGuildLease } from './RedisGuildLeaseCoordinator';
import { SnapshotConflictError } from './PlayerSnapshot';

type Storage = { prefix: string; send: (args: string[]) => Promise<unknown>; script: string };
type Coordinator = { prefix: string; expected: (lease: RedisGuildLease) => string | undefined };
const storages = new WeakMap<object, Storage>();
const coordinators = new WeakMap<object, Coordinator>();
const owners = new WeakMap<object, object>();

/** Internal registrations keep lease credentials out of public SDK handles and snapshots. */
export function registerRedisPlayerStorage(storage: object, prefix: string, send: Storage['send'], script: string): void {
    storages.set(storage, { prefix, send, script });
}
export function registerRedisLeaseCoordinator(coordinator: object, prefix: string, expected: Coordinator['expected']): void {
    coordinators.set(coordinator, { prefix, expected });
}
export function registerRedisOwnership(ownership: object, coordinator: object): void {
    owners.set(ownership, coordinator);
}

/**
 * A standalone Redis instance can fence both keys in one Lua invocation.
 * No fallback to an unfenced CAS when a registered Redis adapter is in use.
 * Other storage adapters retain their existing lease checks.
 */
export async function compareAndSetOwnedPlayer(storage: object, ownership: object | undefined,
    lease: RedisGuildLease, path: string, revision: string | null, value: unknown): Promise<boolean | undefined> {
    const target = storages.get(storage);
    if (!target) return undefined;
    const coordinator = ownership && owners.get(ownership);
    const fence = coordinator && coordinators.get(coordinator);
    if (!fence || fence.prefix !== target.prefix || path !== 'players.' + lease.guildId ||
        !/^\d{17,20}$/.test(lease.guildId)) throw new SnapshotConflictError();
    const expected = fence.expected(lease);
    if (!expected) throw new SnapshotConflictError();
    const serialized = value === undefined ? '' : JSON.stringify(value);
    if (typeof serialized !== 'string') throw new TypeError('RedisStorage expects JSON values');
    const result = await target.send(['EVAL', target.script, '2', target.prefix + path,
        fence.prefix + 'guild-lease.' + lease.guildId, revision ?? '',
        value === undefined ? 'delete' : 'set', serialized, expected]);
    if (result === -1) throw new SnapshotConflictError();
    if (result !== 0 && result !== 1) throw new TypeError('Invalid Redis fenced CAS response');
    return result === 1;
}
