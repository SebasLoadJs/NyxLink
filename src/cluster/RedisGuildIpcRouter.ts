import { randomUUID } from 'node:crypto';
import type { GuildOwnership } from './GuildOwnership';
import type { RedisCommandClient } from '../database/RedisStorage';

/** A Discord voice gateway command. Other gateway opcodes are intentionally excluded. */
export interface GuildVoiceGatewayPacket {
    readonly op: 4;
    readonly d: {
        readonly guild_id: string;
        readonly channel_id: string | null;
        readonly self_deaf: boolean;
        readonly self_mute: boolean;
    };
}

/** Serializable command passed over an application-owned authenticated IPC channel. */
export interface FencedGuildVoiceEnvelope {
    readonly protocol: 'nyxlink/guild-voice/1';
    readonly guildId: string;
    readonly fencingToken: number;
    readonly commandId: string;
    readonly packet: GuildVoiceGatewayPacket;
}

export type GuildVoiceDispatchStatus = 'delivered' | 'stale' | 'duplicate';

export interface RedisGuildIpcOptions {
    client: RedisCommandClient;
    namespace: string;
    /** Deduplication window in milliseconds (1000..300000). Default 60000. */
    dedupeTtlMs?: number;
}

const FENCE_AND_DEDUPE = [
    "local active = redis.call('GET', KEYS[1])",
    "if not active then return 0 end",
    "local generation = string.match(active, ':(%d+)$')",
    "if generation ~= ARGV[1] then return 0 end",
    "local stored = redis.call('SET', KEYS[2], '1', 'NX', 'PX', ARGV[2])",
    "if stored then return 1 end",
    "return 2",
].join('\n');

const snowflake = /^\d{17,20}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateVoicePacket(guildId: string, packet: unknown): GuildVoiceGatewayPacket {
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
        throw new TypeError('IPC voice packet must be an object');
    }
    const value = packet as Record<string, unknown>;
    if (value.op !== 4 || !value.d || typeof value.d !== 'object' || Array.isArray(value.d) ||
        Object.keys(value).some(key => key !== 'op' && key !== 'd')) {
        throw new TypeError('IPC accepts only Discord voice state opcode 4');
    }
    const data = value.d as Record<string, unknown>;
    if (data.guild_id !== guildId ||
        (data.channel_id !== null && (typeof data.channel_id !== 'string' || !snowflake.test(data.channel_id))) ||
        typeof data.self_deaf !== 'boolean' || typeof data.self_mute !== 'boolean' ||
        Object.keys(data).some(key => !['guild_id', 'channel_id', 'self_deaf', 'self_mute'].includes(key))) {
        throw new TypeError('Invalid fenced Discord voice state packet');
    }
    return {
        op: 4,
        d: {
            guild_id: guildId,
            channel_id: data.channel_id as string | null,
            self_deaf: data.self_deaf,
            self_mute: data.self_mute,
        },
    };
}

/**
 * Authenticated-IPC gateway fencing primitive.
 *
 * Sender obtains a fresh lease-backed envelope via prepare(); the receiver
 * calls dispatch() immediately before forwarding to its actual shard gateway.
 * Redis atomically validates generation and deduplicates a commandId.
 *
 * This does not authenticate messages: users MUST secure their IPC transport.
 * Redis validation before an external gateway send is not a distributed
 * transaction. Delayed sends and gateway behavior cannot be perfectly fenced.
 */
export class RedisGuildIpcRouter {
    private readonly client: RedisCommandClient;
    private readonly prefix: string;
    private readonly dedupeTtlMs: number;

    constructor(options: RedisGuildIpcOptions) {
        if (!options?.client || typeof options.client.sendCommand !== 'function') {
            throw new TypeError('Redis IPC fencing requires a Redis command client');
        }
        if (typeof options.namespace !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(options.namespace)) {
            throw new TypeError('Redis IPC namespace must contain 1..64 letters, numbers, _ or -');
        }
        const ttl = options.dedupeTtlMs ?? 60000;
        if (!Number.isInteger(ttl) || ttl < 1000 || ttl > 300000) {
            throw new TypeError('IPC dedupeTtlMs must be 1000..300000');
        }
        this.client = options.client;
        this.prefix = 'nyxlink:' + options.namespace + ':';
        this.dedupeTtlMs = ttl;
    }

    public async prepare(
        ownership: GuildOwnership, guildId: string, packet: GuildVoiceGatewayPacket
    ): Promise<FencedGuildVoiceEnvelope> {
        if (!snowflake.test(guildId)) throw new TypeError('IPC guildId must be a Discord snowflake');
        const data = validateVoicePacket(guildId, packet);
        if (!ownership || typeof ownership.assertCurrent !== 'function') {
            throw new TypeError('IPC sender requires an active GuildOwnership controller');
        }
        // Redis verification before constructing a message is mandatory.
        await ownership.assertCurrent(guildId);
        const lease = ownership.localLease(guildId);
        if (!lease) throw new Error('IPC sender no longer owns the guild');
        return {
            protocol: 'nyxlink/guild-voice/1',
            guildId,
            fencingToken: lease.fencingToken,
            commandId: randomUUID(),
            packet: data,
        };
    }

    public async dispatch(
        message: unknown,
        deliver: (packet: GuildVoiceGatewayPacket) => void | Promise<void>
    ): Promise<GuildVoiceDispatchStatus> {
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
            throw new TypeError('Invalid IPC command envelope');
        }
        if (typeof deliver !== 'function') throw new TypeError('IPC delivery callback is required');
        const entry = message as Record<string, unknown>;
        if (entry.protocol !== 'nyxlink/guild-voice/1' ||
            typeof entry.guildId !== 'string' || !snowflake.test(entry.guildId) ||
            typeof entry.commandId !== 'string' || !uuid.test(entry.commandId) ||
            typeof entry.fencingToken !== 'number' || !Number.isSafeInteger(entry.fencingToken) ||
            entry.fencingToken <= 0 || Object.keys(entry).some(key =>
                !['protocol', 'guildId', 'commandId', 'fencingToken', 'packet'].includes(key))) {
            throw new TypeError('Invalid IPC command envelope');
        }
        const packet = validateVoicePacket(entry.guildId, entry.packet);
        const leaseKey = this.prefix + 'guild-lease.' + entry.guildId;
        const replayKey = this.prefix + 'guild-ipc.' + entry.guildId + '.' + entry.commandId;
        const result = Number(await this.client.sendCommand([
            'EVAL', FENCE_AND_DEDUPE, '2', leaseKey, replayKey,
            String(entry.fencingToken), String(this.dedupeTtlMs),
        ]));
        if (result === 0) return 'stale';
        if (result === 2) return 'duplicate';
        if (result !== 1) throw new Error('Invalid Redis guild IPC fencing result');
        // At-most-once callback invocation per commandId within the TTL.
        // A thrown callback is surfaced and the command is NOT retried by us.
        await deliver(packet);
        return 'delivered';
    }
}
