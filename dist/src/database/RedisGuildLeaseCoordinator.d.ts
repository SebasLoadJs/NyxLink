import type { RedisCommandClient } from './RedisStorage';
export interface RedisGuildLeaseOptions {
    client: RedisCommandClient;
    namespace: string;
    ttlMs?: number;
}
export interface RedisGuildLease {
    readonly guildId: string;
    readonly fencingToken: number;
}
export declare class RedisGuildLeaseCoordinator {
    private readonly client;
    private readonly prefix;
    private readonly ttlMs;
    private readonly secret;
    private readonly active;
    private readonly acquiring;
    private closed;
    get durationMs(): number;
    constructor(options: RedisGuildLeaseOptions);
    private keys;
    private expected;
    acquire(guildId: string): Promise<RedisGuildLease | null>;
    private releaseRemote;
    private ownsHandle;
    renew(lease: RedisGuildLease): Promise<boolean>;
    isCurrent(lease: RedisGuildLease): Promise<boolean>;
    release(lease: RedisGuildLease): Promise<boolean>;
    close(): Promise<void>;
}
