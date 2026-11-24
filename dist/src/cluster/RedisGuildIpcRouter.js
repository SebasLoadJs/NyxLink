"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisGuildIpcRouter = void 0;
const node_crypto_1 = require("node:crypto");
const ALLOCATE_SEQUENCE = [
    "local active = redis.call('GET', KEYS[1])",
    "if not active or string.match(active, ':(%d+)$') ~= ARGV[1] then return 0 end",
    "return redis.call('INCR', KEYS[2])",
].join('\n');
const FENCE_AND_DEDUPE = [
    "local active = redis.call('GET', KEYS[1])",
    "if not active or string.match(active, ':(%d+)$') ~= ARGV[1] then return 0 end",
    "if redis.call('EXISTS', KEYS[2]) == 1 then return 2 end",
    "local previous = tonumber(redis.call('GET', KEYS[3]) or '0')",
    "local next = tonumber(ARGV[3])",
    "local allocated = tonumber(redis.call('GET', KEYS[4]) or '0')",
    "if next <= previous or next > allocated then return 0 end",
    "local stored = redis.call('SET', KEYS[2], '1', 'NX', 'PX', ARGV[2])",
    "if not stored then return 2 end",
    "redis.call('SET', KEYS[3], ARGV[3])",
    "return 1",
].join('\n');
const snowflake = /^\d{17,20}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateVoicePacket(guildId, packet) {
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
        throw new TypeError('IPC voice packet must be an object');
    }
    const value = packet;
    if (value.op !== 4 || !value.d || typeof value.d !== 'object' || Array.isArray(value.d) ||
        Object.keys(value).some(key => key !== 'op' && key !== 'd')) {
        throw new TypeError('IPC accepts only Discord voice state opcode 4');
    }
    const data = value.d;
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
            channel_id: data.channel_id,
            self_deaf: data.self_deaf,
            self_mute: data.self_mute,
        },
    };
}
class RedisGuildIpcRouter {
    client;
    prefix;
    dedupeTtlMs;
    pendingByGuild = new Map();
    constructor(options) {
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
    async prepare(ownership, guildId, packet) {
        if (!snowflake.test(guildId))
            throw new TypeError('IPC guildId must be a Discord snowflake');
        const data = validateVoicePacket(guildId, packet);
        if (!ownership || typeof ownership.assertCurrent !== 'function') {
            throw new TypeError('IPC sender requires an active GuildOwnership controller');
        }
        await ownership.assertCurrent(guildId);
        const lease = ownership.localLease(guildId);
        if (!lease)
            throw new Error('IPC sender no longer owns the guild');
        const leaseKey = this.prefix + 'guild-lease.' + guildId;
        const sequenceKey = this.prefix + 'guild-ipc-sequence.' + guildId;
        const sequence = Number(await this.client.sendCommand([
            'EVAL', ALLOCATE_SEQUENCE, '2', leaseKey, sequenceKey,
            String(lease.fencingToken),
        ]));
        if (sequence === 0)
            throw new Error('Guild lease changed while preparing IPC command');
        if (!Number.isSafeInteger(sequence) || sequence <= 0) {
            throw new Error('Invalid Redis guild IPC sequence');
        }
        return {
            protocol: 'nyxlink/guild-voice/2',
            guildId,
            fencingToken: lease.fencingToken,
            sequence,
            commandId: (0, node_crypto_1.randomUUID)(),
            packet: data,
        };
    }
    async dispatch(message, deliver) {
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
            throw new TypeError('Invalid IPC command envelope');
        }
        if (typeof deliver !== 'function')
            throw new TypeError('IPC delivery callback is required');
        const entry = message;
        if (entry.protocol !== 'nyxlink/guild-voice/2' ||
            typeof entry.guildId !== 'string' || !snowflake.test(entry.guildId) ||
            typeof entry.commandId !== 'string' || !uuid.test(entry.commandId) ||
            typeof entry.fencingToken !== 'number' || !Number.isSafeInteger(entry.fencingToken) ||
            entry.fencingToken <= 0 || typeof entry.sequence !== 'number' ||
            !Number.isSafeInteger(entry.sequence) || entry.sequence <= 0 ||
            Object.keys(entry).some(key => !['protocol', 'guildId', 'commandId', 'fencingToken', 'sequence', 'packet'].includes(key))) {
            throw new TypeError('Invalid IPC command envelope');
        }
        const packet = validateVoicePacket(entry.guildId, entry.packet);
        const guildId = entry.guildId;
        const previous = this.pendingByGuild.get(guildId) ?? Promise.resolve();
        const operation = previous.then(async () => {
            const leaseKey = this.prefix + 'guild-lease.' + guildId;
            const replayKey = this.prefix + 'guild-ipc.' + guildId + '.' + entry.commandId;
            const lastKey = this.prefix + 'guild-ipc-last.' + guildId;
            const sequenceKey = this.prefix + 'guild-ipc-sequence.' + guildId;
            const result = Number(await this.client.sendCommand([
                'EVAL', FENCE_AND_DEDUPE, '4', leaseKey, replayKey, lastKey, sequenceKey,
                String(entry.fencingToken), String(this.dedupeTtlMs), String(entry.sequence),
            ]));
            if (result === 0)
                return 'stale';
            if (result === 2)
                return 'duplicate';
            if (result !== 1)
                throw new Error('Invalid Redis guild IPC fencing result');
            await deliver(packet);
            return 'delivered';
        });
        const barrier = operation.then(() => undefined, () => undefined);
        this.pendingByGuild.set(guildId, barrier);
        void barrier.then(() => {
            if (this.pendingByGuild.get(guildId) === barrier) {
                this.pendingByGuild.delete(guildId);
            }
        });
        return operation;
    }
}
exports.RedisGuildIpcRouter = RedisGuildIpcRouter;
//# sourceMappingURL=RedisGuildIpcRouter.js.map