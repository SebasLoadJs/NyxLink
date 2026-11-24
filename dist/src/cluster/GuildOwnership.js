"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuildOwnership = void 0;
const PlaybackGuard_1 = require("../players/PlaybackGuard");
const assignedCoordinators = new WeakSet();
class GuildOwnership {
    manager;
    coordinator;
    active = new Map();
    pending = new Map();
    interval;
    refreshing = false;
    closed = false;
    constructor(manager, options) {
        if (!options?.coordinator ||
            typeof options.coordinator.acquire !== 'function' ||
            typeof options.coordinator.isCurrent !== 'function' ||
            typeof options.coordinator.renew !== 'function') {
            throw new TypeError('Guild ownership requires a Redis lease coordinator');
        }
        const ttl = options.coordinator.durationMs;
        if (!Number.isInteger(ttl) || ttl < 1000)
            throw new TypeError('Invalid guild lease TTL');
        const interval = options.renewIntervalMs ?? Math.max(100, Math.floor(ttl / 3));
        if (!Number.isInteger(interval) || interval < 50 || interval >= ttl / 2) {
            throw new TypeError('Guild lease renewal must be at least 50ms and less than TTL/2');
        }
        if (assignedCoordinators.has(options.coordinator)) {
            throw new Error('A guild lease coordinator may belong to only one Manager');
        }
        assignedCoordinators.add(options.coordinator);
        this.manager = manager;
        this.coordinator = options.coordinator;
        this.interval = setInterval(() => { void this.heartbeat(); }, interval);
        this.interval.unref();
    }
    get isClosed() { return this.closed; }
    localLease(guildId) {
        return this.active.get(guildId);
    }
    assertLocal(guildId) {
        if (this.closed || !this.active.has(guildId)) {
            throw new Error('Guild lease is not owned locally: use players.createOwned() or restoreOwned()');
        }
    }
    drop(guildId, lease, reason) {
        if (this.active.get(guildId) !== lease)
            return;
        this.active.delete(guildId);
        const player = this.manager.players.get(guildId);
        if (player && !player.destroyed) {
            (0, PlaybackGuard_1.playbackGuard)(player).invalidate();
            player.stopHealthCheck();
        }
        try {
            this.manager.emit('guildOwnershipLost', guildId, lease.fencingToken, reason);
        }
        catch { }
    }
    async isCurrent(guildId) {
        const lease = this.active.get(guildId);
        if (this.closed || !lease)
            return false;
        try {
            const current = await this.coordinator.isCurrent(lease);
            if (current && !this.closed && this.active.get(guildId) === lease)
                return true;
            this.drop(guildId, lease, 'expired-or-replaced');
        }
        catch {
            this.drop(guildId, lease, 'redis-unavailable');
        }
        return false;
    }
    async assertCurrent(guildId) {
        if (!await this.isCurrent(guildId)) {
            throw new Error('Guild lease is not current; refusing voice or backend command');
        }
    }
    acquire(guildId) {
        if (this.closed || this.manager.destroyed) {
            return Promise.reject(new Error('Guild ownership is closed'));
        }
        const pending = this.pending.get(guildId);
        if (pending)
            return pending;
        const operation = (async () => {
            if (await this.isCurrent(guildId))
                return this.active.get(guildId);
            const lease = await this.coordinator.acquire(guildId);
            if (!lease)
                throw new Error('Guild lease is owned by another process');
            if (this.closed || this.manager.destroyed) {
                await this.coordinator.release(lease);
                throw new Error('Guild ownership is closed');
            }
            this.active.set(guildId, lease);
            return lease;
        })();
        this.pending.set(guildId, operation);
        void operation.finally(() => {
            if (this.pending.get(guildId) === operation)
                this.pending.delete(guildId);
        }).catch(() => undefined);
        return operation;
    }
    async release(guildId, expected) {
        const held = this.active.get(guildId);
        if (!held || expected && held !== expected)
            return;
        this.active.delete(guildId);
        await this.coordinator.release(held);
    }
    async heartbeat() {
        if (this.closed || this.refreshing)
            return;
        this.refreshing = true;
        try {
            await Promise.all([...this.active].map(async ([guildId, lease]) => {
                if (this.active.get(guildId) !== lease)
                    return;
                try {
                    if (!await this.coordinator.renew(lease)) {
                        this.drop(guildId, lease, 'renewal-rejected');
                    }
                }
                catch {
                    this.drop(guildId, lease, 'redis-unavailable');
                }
            }));
        }
        finally {
            this.refreshing = false;
        }
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        clearInterval(this.interval);
        await Promise.allSettled([...this.pending.values()]);
        this.active.clear();
        await this.coordinator.close();
    }
}
exports.GuildOwnership = GuildOwnership;
//# sourceMappingURL=GuildOwnership.js.map