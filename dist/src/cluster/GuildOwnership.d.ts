import type { Manager } from '../core/Manager';
import { RedisGuildLeaseCoordinator, type RedisGuildLease } from '../database/RedisGuildLeaseCoordinator';
export interface GuildOwnershipOptions {
    coordinator: RedisGuildLeaseCoordinator;
    renewIntervalMs?: number;
}
export declare class GuildOwnership {
    private readonly manager;
    private readonly coordinator;
    private readonly active;
    private readonly pending;
    private readonly interval;
    private refreshing;
    private closed;
    constructor(manager: Manager, options: GuildOwnershipOptions);
    get isClosed(): boolean;
    localLease(guildId: string): RedisGuildLease | undefined;
    assertLocal(guildId: string): void;
    private drop;
    isCurrent(guildId: string): Promise<boolean>;
    assertCurrent(guildId: string): Promise<void>;
    acquire(guildId: string): Promise<RedisGuildLease>;
    release(guildId: string, expected?: RedisGuildLease): Promise<void>;
    private heartbeat;
    close(): Promise<void>;
}
