"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisGuildLeaseCoordinator = void 0;
const node_crypto_1 = require("node:crypto");
const ACQUIRE = [
    "if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end",
    "local sequence = redis.call('INCR', KEYS[2])",
    "redis.call('SET', KEYS[1], ARGV[1] .. ':' .. sequence, 'PX', ARGV[2])",
    "return sequence",
].join('\n');
const RENEW = [
    "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end",
    "return redis.call('PEXPIRE', KEYS[1], ARGV[2])",
].join('\n');
const RELEASE = [
    "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end",
    "return redis.call('DEL', KEYS[1])",
].join('\n');
const CHECK = [
    "return redis.call('GET', KEYS[1]) == ARGV[1] and 1 or 0",
].join('\n');
class RedisGuildLeaseCoordinator {
    client;
    prefix;
    ttlMs;
    secret = (0, node_crypto_1.randomUUID)();
    active = new Map();
    acquiring = new Set();
    closed = false;
    get durationMs() { return this.ttlMs; }
    constructor(options) {
        if (!options?.client || typeof options.client.sendCommand !== 'function') {
            throw new TypeError('Guild leases require a Redis sendCommand client');
        }
        if (typeof options.namespace !== 'string' ||
            !/^[A-Za-z0-9_-]{1,64}$/.test(options.namespace)) {
            throw new TypeError('Invalid Redis lease namespace');
        }
        const ttl = options.ttlMs ?? 30000;
        if (!Number.isInteger(ttl) || ttl < 1000 || ttl > 300000) {
            throw new TypeError('Redis lease ttlMs must be 1000..300000');
        }
        this.client = options.client;
        this.prefix = 'nyxlink:' + options.namespace + ':';
        this.ttlMs = ttl;
    }
    keys(guildId) {
        if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) {
            throw new TypeError('Guild lease requires a Discord snowflake');
        }
        return [this.prefix + 'guild-lease.' + guildId,
            this.prefix + 'guild-lease-counter.' + guildId];
    }
    expected(lease) {
        return this.secret + ':' + lease.fencingToken;
    }
    acquire(guildId) {
        if (this.closed)
            return Promise.reject(new Error('Guild lease coordinator is closed'));
        const [lock, counter] = this.keys(guildId);
        const operation = this.client.sendCommand(['EVAL', ACQUIRE, '2', lock, counter, this.secret, String(this.ttlMs)])
            .then(async (value) => {
            if (value === 0)
                return null;
            if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
                throw new TypeError('Invalid Redis fencing token');
            }
            const lease = Object.freeze({ guildId, fencingToken: value });
            if (this.closed) {
                await this.releaseRemote(lease);
                return null;
            }
            this.active.set(guildId, lease);
            return lease;
        });
        this.acquiring.add(operation);
        void operation.finally(() => this.acquiring.delete(operation)).catch(() => undefined);
        return operation;
    }
    async releaseRemote(lease) {
        const [key] = this.keys(lease.guildId);
        return Number(await this.client.sendCommand(['EVAL', RELEASE, '1', key, this.expected(lease)])) === 1;
    }
    ownsHandle(lease) {
        return !!lease && this.active.get(lease.guildId) === lease;
    }
    async renew(lease) {
        if (this.closed || !this.ownsHandle(lease))
            return false;
        const [key] = this.keys(lease.guildId);
        const renewed = Number(await this.client.sendCommand(['EVAL', RENEW, '1',
            key, this.expected(lease), String(this.ttlMs)])) === 1;
        if (!renewed && this.ownsHandle(lease))
            this.active.delete(lease.guildId);
        return renewed;
    }
    async isCurrent(lease) {
        if (this.closed || !this.ownsHandle(lease))
            return false;
        const [key] = this.keys(lease.guildId);
        const current = Number(await this.client.sendCommand(['EVAL', CHECK, '1', key, this.expected(lease)])) === 1;
        if (!current && this.ownsHandle(lease))
            this.active.delete(lease.guildId);
        return current;
    }
    async release(lease) {
        if (!this.ownsHandle(lease))
            return false;
        const result = await this.releaseRemote(lease);
        if (this.ownsHandle(lease))
            this.active.delete(lease.guildId);
        return result;
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        await Promise.allSettled([...this.acquiring]);
        const leases = [...this.active.values()];
        const results = await Promise.allSettled(leases.map(lease => this.releaseRemote(lease)));
        this.active.clear();
        const errors = results.filter((result) => result.status === 'rejected');
        if (errors.length)
            throw new AggregateError(errors.map(item => item.reason), 'Redis lease cleanup failed');
    }
}
exports.RedisGuildLeaseCoordinator = RedisGuildLeaseCoordinator;
//# sourceMappingURL=RedisGuildLeaseCoordinator.js.map