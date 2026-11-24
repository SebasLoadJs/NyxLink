import type { GuildOwnership } from './GuildOwnership';
import type { RedisCommandClient } from '../database/RedisStorage';
export interface GuildVoiceGatewayPacket {
    readonly op: 4;
    readonly d: {
        readonly guild_id: string;
        readonly channel_id: string | null;
        readonly self_deaf: boolean;
        readonly self_mute: boolean;
    };
}
export interface FencedGuildVoiceEnvelope {
    readonly protocol: 'nyxlink/guild-voice/2';
    readonly guildId: string;
    readonly fencingToken: number;
    readonly sequence: number;
    readonly commandId: string;
    readonly packet: GuildVoiceGatewayPacket;
}
export type GuildVoiceDispatchStatus = 'delivered' | 'stale' | 'duplicate';
export interface RedisGuildIpcOptions {
    client: RedisCommandClient;
    namespace: string;
    dedupeTtlMs?: number;
}
export declare class RedisGuildIpcRouter {
    private readonly client;
    private readonly prefix;
    private readonly dedupeTtlMs;
    private readonly pendingByGuild;
    constructor(options: RedisGuildIpcOptions);
    prepare(ownership: GuildOwnership, guildId: string, packet: GuildVoiceGatewayPacket): Promise<FencedGuildVoiceEnvelope>;
    dispatch(message: unknown, deliver: (packet: GuildVoiceGatewayPacket) => void | Promise<void>): Promise<GuildVoiceDispatchStatus>;
}
