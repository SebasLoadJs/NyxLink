import { randomUUID } from 'node:crypto';
import type { RedisCommandClient } from './RedisStorage';
import { registerRedisLeaseCoordinator } from './RedisPlayerFence';

export interface RedisGuildLeaseOptions {
  client: RedisCommandClient;
  namespace: string;
  /** Lease duration in milliseconds, 1000..300000; default 30000. */
  ttlMs?: number;
}

export interface RedisGuildLease {
  readonly guildId: string;
  /** Monotonic Redis-generated fencing number, scoped to one guild and namespace. */
  readonly fencingToken: number;
}

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

/**
 * Optional per-guild Redis coordination primitive for externally managed shards.
 *
 * This cannot and does not automatically arbitrate Discord gateway connections
 * or fence Lavalink commands. A bot must validate ownership before issuing
 * voice commands and stop/cancel its work after renew() returns false.
 */
export class RedisGuildLeaseCoordinator {
  private readonly client: RedisCommandClient;
  private readonly prefix: string;
  private readonly ttlMs: number;
  private readonly secret = randomUUID();
  private readonly active = new Map<string, RedisGuildLease>();
  private readonly acquiring = new Set<Promise<RedisGuildLease | null>>();
  private closed = false;

  /** Maximum lease lifetime without a successful renewal. */
  public get durationMs(): number { return this.ttlMs; }

  constructor(options: RedisGuildLeaseOptions) {
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
    registerRedisLeaseCoordinator(this, this.prefix, lease => {
      if (this.closed || !this.ownsHandle(lease)) return undefined;
      return this.expected(lease);
    });
  }

  private keys(guildId: string): [string, string] {
    if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) {
      throw new TypeError('Guild lease requires a Discord snowflake');
    }
    return [this.prefix + 'guild-lease.' + guildId,
      this.prefix + 'guild-lease-counter.' + guildId];
  }

  private expected(lease: RedisGuildLease): string {
    return this.secret + ':' + lease.fencingToken;
  }

  public acquire(guildId: string): Promise<RedisGuildLease | null> {
    if (this.closed) return Promise.reject(new Error('Guild lease coordinator is closed'));
    const [lock, counter] = this.keys(guildId);
    // Redis is authoritative: a locally remembered lease may have expired.
    // The atomic EVAL prevents acquiring a second owner while it is still live.
    const operation = this.client.sendCommand(['EVAL', ACQUIRE, '2', lock, counter, this.secret, String(this.ttlMs)])
      .then(async value => {
        if (value === 0) return null;
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
          throw new TypeError('Invalid Redis fencing token');
        }
        const lease: RedisGuildLease = Object.freeze({ guildId, fencingToken: value });
        // close() can race with EVAL; never abandon a newly acquired live lock.
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

  private async releaseRemote(lease: RedisGuildLease): Promise<boolean> {
    const [key] = this.keys(lease.guildId);
    return Number(await this.client.sendCommand(['EVAL', RELEASE, '1', key, this.expected(lease)])) === 1;
  }

  private ownsHandle(lease: RedisGuildLease): boolean {
    return !!lease && this.active.get(lease.guildId) === lease;
  }

  public async renew(lease: RedisGuildLease): Promise<boolean> {
    if (this.closed || !this.ownsHandle(lease)) return false;
    const [key] = this.keys(lease.guildId);
    const renewed = Number(await this.client.sendCommand(['EVAL', RENEW, '1',
      key, this.expected(lease), String(this.ttlMs)])) === 1;
    if (!renewed && this.ownsHandle(lease)) this.active.delete(lease.guildId);
    return renewed;
  }

  public async isCurrent(lease: RedisGuildLease): Promise<boolean> {
    if (this.closed || !this.ownsHandle(lease)) return false;
    const [key] = this.keys(lease.guildId);
    const current = Number(await this.client.sendCommand(['EVAL', CHECK, '1', key, this.expected(lease)])) === 1;
    if (!current && this.ownsHandle(lease)) this.active.delete(lease.guildId);
    return current;
  }

  public async release(lease: RedisGuildLease): Promise<boolean> {
    if (!this.ownsHandle(lease)) return false;
    const result = await this.releaseRemote(lease);
    if (this.ownsHandle(lease)) this.active.delete(lease.guildId);
    return result;
  }

  /** Release all leases held by this coordinator; never close the shared client. */
  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await Promise.allSettled([...this.acquiring]);
    const leases = [...this.active.values()];
    const results = await Promise.allSettled(leases.map(lease => this.releaseRemote(lease)));
    this.active.clear();
    const errors = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (errors.length) throw new AggregateError(errors.map(item => item.reason), 'Redis lease cleanup failed');
  }
}
