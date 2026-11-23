import type { Manager } from '../core/Manager';
import { RedisGuildLeaseCoordinator, type RedisGuildLease } from '../database/RedisGuildLeaseCoordinator';

export interface GuildOwnershipOptions {
    /** Must be a connected, dedicated coordinator for this Manager. */
    coordinator: RedisGuildLeaseCoordinator;
    /** Default: one third of the Redis lease TTL; must be < TTL/2. */
    renewIntervalMs?: number;
}

/**
 * Opt-in coordination of Player ownership. Cross-process Redis acquisition
 * precedes synchronous Player construction. Local and remote command guards
 * fail closed after a lease expires or a Redis operation fails.
 *
 * IMPORTANT: Redis fencing is advisory for Lavalink/Discord endpoints that do
 * not accept fencing tokens. No exactly-once voice guarantee is claimed.
 */
export class GuildOwnership {
    private readonly manager: Manager;
    private readonly coordinator: RedisGuildLeaseCoordinator;
    private readonly active = new Map<string, RedisGuildLease>();
    private readonly pending = new Map<string, Promise<RedisGuildLease>>();
    private readonly interval: NodeJS.Timeout;
    private refreshing = false;
    private closed = false;

    constructor(manager: Manager, options: GuildOwnershipOptions) {
        if (!options?.coordinator ||
            typeof options.coordinator.acquire !== 'function' ||
            typeof options.coordinator.isCurrent !== 'function' ||
            typeof options.coordinator.renew !== 'function') {
            throw new TypeError('Guild ownership requires a Redis lease coordinator');
        }
        const ttl = options.coordinator.durationMs;
        if (!Number.isInteger(ttl) || ttl < 1000) throw new TypeError('Invalid guild lease TTL');
        const interval = options.renewIntervalMs ?? Math.max(100, Math.floor(ttl / 3));
        if (!Number.isInteger(interval) || interval < 50 || interval >= ttl / 2) {
            throw new TypeError('Guild lease renewal must be at least 50ms and less than TTL/2');
        }
        this.manager = manager;
        this.coordinator = options.coordinator;
        this.interval = setInterval(() => { void this.heartbeat(); }, interval);
        this.interval.unref();
    }

    public get isClosed(): boolean { return this.closed; }

    public localLease(guildId: string): RedisGuildLease | undefined {
        return this.active.get(guildId);
    }

    /** Synchronous fence for immediate gateway sends and legacy create(). */
    public assertLocal(guildId: string): void {
        if (this.closed || !this.active.has(guildId)) {
            throw new Error('Guild lease is not owned locally: use players.createOwned() or restoreOwned()');
        }
    }

    private drop(guildId: string, lease: RedisGuildLease, reason: string): void {
        if (this.active.get(guildId) !== lease) return;
        this.active.delete(guildId);
        try { this.manager.emit('guildOwnershipLost', guildId, lease.fencingToken, reason); }
        catch { /* consumer observers must not interrupt coordination */ }
    }

    /** Redis is authoritative. Errors are treated as loss of ownership. */
    public async isCurrent(guildId: string): Promise<boolean> {
        const lease = this.active.get(guildId);
        if (this.closed || !lease) return false;
        try {
            const current = await this.coordinator.isCurrent(lease);
            if (current && !this.closed && this.active.get(guildId) === lease) return true;
            this.drop(guildId, lease, 'expired-or-replaced');
        } catch {
            this.drop(guildId, lease, 'redis-unavailable');
        }
        return false;
    }

    public async assertCurrent(guildId: string): Promise<void> {
        if (!await this.isCurrent(guildId)) {
            throw new Error('Guild lease is not current; refusing voice or backend command');
        }
    }

    public acquire(guildId: string): Promise<RedisGuildLease> {
        if (this.closed || this.manager.destroyed) {
            return Promise.reject(new Error('Guild ownership is closed'));
        }
        const pending = this.pending.get(guildId);
        if (pending) return pending;
        const operation = (async () => {
            if (await this.isCurrent(guildId)) return this.active.get(guildId)!;
            const lease = await this.coordinator.acquire(guildId);
            if (!lease) throw new Error('Guild lease is owned by another process');
            if (this.closed || this.manager.destroyed) {
                await this.coordinator.release(lease);
                throw new Error('Guild ownership is closed');
            }
            this.active.set(guildId, lease);
            return lease;
        })();
        this.pending.set(guildId, operation);
        void operation.finally(() => {
            if (this.pending.get(guildId) === operation) this.pending.delete(guildId);
        }).catch(() => undefined);
        return operation;
    }

    /** Releases only the matching generation; never a newer local owner. */
    public async release(guildId: string, expected?: RedisGuildLease): Promise<void> {
        const held = this.active.get(guildId);
        if (!held || expected && held !== expected) return;
        this.active.delete(guildId);
        await this.coordinator.release(held);
    }

    private async heartbeat(): Promise<void> {
        if (this.closed || this.refreshing) return;
        this.refreshing = true;
        try {
            await Promise.all([...this.active].map(async ([guildId, lease]) => {
                if (this.active.get(guildId) !== lease) return;
                try {
                    if (!await this.coordinator.renew(lease)) {
                        this.drop(guildId, lease, 'renewal-rejected');
                    }
                } catch {
                    this.drop(guildId, lease, 'redis-unavailable');
                }
            }));
        } finally {
            this.refreshing = false;
        }
    }

    public async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        clearInterval(this.interval);
        await Promise.allSettled([...this.pending.values()]);
        this.active.clear();
        await this.coordinator.close();
    }
}
