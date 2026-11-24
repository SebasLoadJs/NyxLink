"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisStorage = void 0;
const MUTATE = [
    "local old = redis.call('GET', KEYS[1])",
    "local record = old and cjson.decode(old) or nil",
    "local path = cjson.decode(ARGV[1])",
    "local deleting = ARGV[2] == 'delete'",
    "local value = nil",
    "if not deleting then value = cjson.decode(ARGV[3]) end",
    "if #path == 0 then",
    " if deleting then return redis.call('DEL', KEYS[1]) end",
    " redis.call('SET', KEYS[1], ARGV[3]); return 1",
    "end",
    "if deleting and not old then return 0 end",
    "if record == nil or type(record) ~= 'table' then record = {} end",
    "local current = record",
    "for i=1,#path-1 do",
    " local field = path[i]",
    " if current[field] == nil or type(current[field]) ~= 'table' then",
    "  if deleting then return 0 end",
    "  current[field] = {}",
    " end",
    " current = current[field]",
    "end",
    "local field = path[#path]",
    "if deleting then",
    " if current[field] == nil then return 0 end",
    " current[field] = nil",
    "else current[field] = value end",
    "redis.call('SET', KEYS[1], cjson.encode(record)); return 1",
].join('\n');
const CAS = [
    "local old = redis.call('GET', KEYS[1])",
    "local record = old and cjson.decode(old) or nil",
    "local revision = ''",
    "if type(record) == 'table' and type(record.revision) == 'string' then revision = record.revision end",
    "if revision ~= ARGV[1] then return 0 end",
    "if ARGV[2] == 'delete' then redis.call('DEL', KEYS[1])",
    "else redis.call('SET', KEYS[1], ARGV[3]) end",
    "return 1",
].join('\n');
class RedisStorage {
    client;
    prefix;
    initialized = false;
    stopped = false;
    constructor(options) {
        if (!options?.client || typeof options.client.sendCommand !== 'function') {
            throw new TypeError('RedisStorage requires a sendCommand client');
        }
        if (typeof options.namespace !== 'string' ||
            !/^[A-Za-z0-9_-]{1,64}$/.test(options.namespace)) {
            throw new TypeError('RedisStorage namespace must be 1..64 letters, numbers, _ or -');
        }
        this.client = options.client;
        this.prefix = 'nyxlink:' + options.namespace + ':';
    }
    async init(_manager) {
        if (this.initialized || this.stopped)
            throw new Error('RedisStorage cannot be initialized twice');
        if (await this.client.sendCommand(['PING']) !== 'PONG')
            throw new Error('RedisStorage requires a connected Redis server');
        this.initialized = true;
    }
    async send(...args) {
        if (!this.initialized || this.stopped)
            throw new Error('RedisStorage is unavailable');
        return this.client.sendCommand(args);
    }
    segments(path) {
        if (typeof path !== 'string' || !path || path.length > 512)
            throw new TypeError('Invalid RedisStorage key');
        const parts = path.split('.');
        if (parts.some(part => !part || part.length > 128 ||
            !/^[A-Za-z0-9_-]+$/.test(part) ||
            ['__proto__', 'constructor', 'prototype'].includes(part))) {
            throw new TypeError('Invalid RedisStorage path segment');
        }
        return parts;
    }
    locate(path) {
        const parts = this.segments(path);
        const boundary = Math.min(2, parts.length);
        return {
            key: this.prefix + parts.slice(0, boundary).join('.'),
            tail: parts.slice(boundary),
        };
    }
    decode(input) {
        if (input === null || input === undefined)
            return undefined;
        if (typeof input !== 'string')
            throw new TypeError('Invalid RedisStorage response');
        return JSON.parse(input);
    }
    async scan() {
        const keys = new Set();
        let cursor = '0';
        let cycles = 0;
        do {
            const result = await this.send('SCAN', cursor, 'MATCH', this.prefix + '*', 'COUNT', '100');
            if (!Array.isArray(result) || result.length !== 2 || !Array.isArray(result[1])) {
                throw new TypeError('RedisStorage SCAN response is invalid');
            }
            cursor = String(result[0]);
            for (const key of result[1]) {
                if (typeof key === 'string' && key.startsWith(this.prefix))
                    keys.add(key);
                if (keys.size > 50000)
                    throw new Error('RedisStorage scan limit exceeded');
            }
            if (++cycles > 10000)
                throw new Error('RedisStorage scan cursor limit exceeded');
        } while (cursor !== '0');
        return [...keys];
    }
    async get(path) {
        const { key, tail } = this.locate(path);
        const direct = this.decode(await this.send('GET', key));
        if (tail.length) {
            let current = direct;
            for (const field of tail) {
                if (!current || typeof current !== 'object' || !Object.hasOwn(current, field))
                    return undefined;
                current = current[field];
            }
            return current;
        }
        if (direct !== undefined)
            return direct;
        if (this.segments(path).length !== 1)
            return undefined;
        const record = Object.create(null);
        let found = false;
        for (const physical of await this.scan()) {
            if (!physical.startsWith(key + '.'))
                continue;
            const child = physical.slice(key.length + 1);
            if (!child || child.includes('.'))
                continue;
            const value = this.decode(await this.send('GET', physical));
            if (value === undefined)
                continue;
            record[child] = value;
            found = true;
        }
        return found ? record : undefined;
    }
    async set(path, value) {
        const { key, tail } = this.locate(path);
        const serialized = value === undefined ? '' : JSON.stringify(value);
        if (value !== undefined && typeof serialized !== 'string')
            throw new TypeError('RedisStorage expects JSON values');
        await this.send('EVAL', MUTATE, '1', key, JSON.stringify(tail), value === undefined ? 'delete' : 'set', serialized);
    }
    async remove(path) {
        const { key, tail } = this.locate(path);
        return Number(await this.send('EVAL', MUTATE, '1', key, JSON.stringify(tail), 'delete', '')) === 1;
    }
    async has(path) { return await this.get(path) !== undefined; }
    async compareAndSet(path, revision, value) {
        const { key, tail } = this.locate(path);
        if (tail.length)
            throw new TypeError('RedisStorage CAS requires a record root');
        if (revision !== null && (typeof revision !== 'string' || !revision || revision.length > 256)) {
            throw new TypeError('Invalid expected revision');
        }
        const serialized = value === undefined ? '' : JSON.stringify(value);
        if (value !== undefined && typeof serialized !== 'string')
            throw new TypeError('RedisStorage expects JSON values');
        return Number(await this.send('EVAL', CAS, '1', key, revision ?? '', value === undefined ? 'delete' : 'set', serialized)) === 1;
    }
    *leaves(value, prefix) {
        if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length) {
            for (const [field, child] of Object.entries(value))
                yield* this.leaves(child, prefix + '.' + field);
        }
        else
            yield prefix;
    }
    async keys(pattern = '*') {
        if (typeof pattern !== 'string' || pattern.length > 512)
            throw new TypeError('Invalid key pattern');
        const regex = new RegExp('^' + pattern.split('*').map(part => part.replace(/[^A-Za-z0-9_]/g, '\\$&')).join('.*') + '$');
        const found = new Set();
        for (const physical of await this.scan()) {
            const decoded = this.decode(await this.send('GET', physical));
            if (decoded === undefined)
                continue;
            for (const key of this.leaves(decoded, physical.slice(this.prefix.length))) {
                if (regex.test(key))
                    found.add(key);
            }
        }
        return [...found].sort();
    }
    async clear() {
        for (const key of await this.scan())
            await this.send('DEL', key);
    }
    async flush() { await this.send('PING'); }
    async shutdown() { this.stopped = true; }
}
exports.RedisStorage = RedisStorage;
//# sourceMappingURL=RedisStorage.js.map