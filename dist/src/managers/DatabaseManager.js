"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseManager = void 0;
const Memory_1 = require("../database/Memory");
const Local_1 = require("../database/Local");
const node_crypto_1 = require("node:crypto");
const PlayerSnapshot_1 = require("../database/PlayerSnapshot");
function copyPlayerValue(value, ancestors = new Set()) {
    if (value === null || typeof value !== 'object') {
        return ['function', 'symbol', 'bigint'].includes(typeof value) ? (0, PlayerSnapshot_1.snapshotJSON)(value) : value;
    }
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null || typeof value.toJSON === 'function')
        return (0, PlayerSnapshot_1.snapshotJSON)(value);
    if (ancestors.has(value))
        throw new PlayerSnapshot_1.SnapshotValidationError('Snapshot must not contain circular metadata');
    ancestors.add(value);
    const copy = Array.isArray(value) ? new Array(value.length) : {};
    for (const key of Object.keys(value)) {
        const item = copyPlayerValue(value[key], ancestors);
        if (key === '__proto__')
            Object.defineProperty(copy, key, { value: item, enumerable: true, writable: true, configurable: true });
        else
            copy[key] = item;
    }
    ancestors.delete(value);
    return copy;
}
class DatabaseManager {
    provider;
    tail = Promise.resolve();
    closing = false;
    shutdownPromise;
    importing = new Set();
    manager;
    dbConfig;
    constructor(manager) {
        this.manager = manager;
        this.dbConfig = this.manager.options.database || { type: 'memory' };
        if (this.manager.options.database?.adapter) {
            this.provider = this.manager.options.database.adapter;
            return;
        }
        switch (this.dbConfig.type) {
            case 'local':
                this.provider = new Local_1.Local();
                break;
            case 'memory':
            default:
                this.provider = new Memory_1.Memory();
                break;
        }
    }
    async initialize() {
        await this.provider.init(this.manager, this.dbConfig.options);
    }
    async get(key) {
        await this.tail;
        const value = await this.provider.get(key);
        return value !== undefined && (key === 'players' || /^players\.(\d{17,20})(?:\.|$)/.test(key)) ? copyPlayerValue(value) : value;
    }
    set(key, value) {
        if (/^players\.\d{17,20}(?:\.|$)/.test(key)) {
            let frozen;
            try {
                frozen = value === undefined ? value : copyPlayerValue(value);
            }
            catch (error) {
                return Promise.reject(error);
            }
            return this.mutate(async () => { await this.changePlayer(key, frozen, value === undefined); });
        }
        return this.mutate(() => this.provider.set(key, value));
    }
    remove(key) {
        if (/^players\.\d{17,20}(?:\.|$)/.test(key))
            return this.mutate(() => this.changePlayer(key, undefined, true));
        return this.mutate(() => this.provider.remove(key));
    }
    async changePlayer(key, value, deleting) {
        const [namespace, guildId, ...parts] = key.split('.');
        if (parts.some(part => !part || ['__proto__', 'constructor', 'prototype'].includes(part)) || ['revision', 'schemaVersion'].includes(parts[0]))
            throw new TypeError('Invalid player storage path');
        const root = `${namespace}.${guildId}`;
        for (let attempt = 0; attempt < 8; attempt++) {
            const previous = await this.provider.get(root);
            const revision = (0, PlayerSnapshot_1.recordRevision)(previous);
            if (deleting && previous === undefined)
                return false;
            const candidate = parts.length ? { ...previous } : deleting ? undefined : value;
            if (candidate !== undefined && (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)))
                throw new TypeError('Stored player must be an object');
            const next = candidate;
            if (parts.length) {
                let parent = next;
                for (const part of parts.slice(0, -1)) {
                    if (!Object.hasOwn(parent, part) || !parent[part] || typeof parent[part] !== 'object') {
                        if (deleting)
                            return false;
                        parent[part] = {};
                    }
                    else {
                        parent[part] = Array.isArray(parent[part]) ? [...parent[part]] : { ...parent[part] };
                    }
                    parent = parent[part];
                }
                const field = parts.at(-1);
                if (deleting) {
                    if (!Object.hasOwn(parent, field))
                        return false;
                    delete parent[field];
                }
                else
                    parent[field] = value;
            }
            if (next !== undefined) {
                (0, PlayerSnapshot_1.recordRevision)(next);
                next.schemaVersion = 1;
                next.revision = (0, node_crypto_1.randomUUID)();
            }
            if (await this.replace(root, revision, next))
                return true;
        }
        throw new PlayerSnapshot_1.SnapshotConflictError();
    }
    async replace(key, revision, value) {
        if (this.provider.compareAndSet)
            return this.provider.compareAndSet(key, revision, value);
        if (value === undefined)
            await this.provider.remove(key);
        else
            await this.provider.set(key, value);
        return true;
    }
    isImportingPlayer(guildId) { return this.importing.has(guildId); }
    async exportPlayer(guildId) {
        if (!/^\d{17,20}$/.test(guildId))
            throw new TypeError('Invalid snapshot guild');
        const record = await this.get(`players.${guildId}`);
        if (record === undefined)
            return undefined;
        const snapshot = PlayerSnapshot_1.PlayerSnapshotCodec.fromRecord(record);
        if (snapshot.data.guildId !== guildId)
            throw new PlayerSnapshot_1.SnapshotValidationError('Snapshot guild does not match its storage key');
        return snapshot;
    }
    importPlayer(input, expectedRevision) {
        let snapshot;
        try {
            snapshot = PlayerSnapshot_1.PlayerSnapshotCodec.parse(input);
        }
        catch (error) {
            return Promise.reject(error);
        }
        const guildId = snapshot.data.guildId;
        if (expectedRevision !== null && (typeof expectedRevision !== 'string' || !expectedRevision || expectedRevision.length > 256))
            return Promise.reject(new TypeError('Expected snapshot revision is required'));
        if (this.importing.has(guildId) || this.manager.players.has(guildId))
            return Promise.reject(new PlayerSnapshot_1.SnapshotConflictError());
        this.importing.add(guildId);
        return this.mutate(async () => {
            const key = `players.${guildId}`;
            const previous = await this.provider.get(key);
            if (this.manager.players.has(guildId) || (0, PlayerSnapshot_1.recordRevision)(previous) !== expectedRevision)
                throw new PlayerSnapshot_1.SnapshotConflictError();
            const revision = (0, node_crypto_1.randomUUID)();
            const next = { ...snapshot.data, schemaVersion: 1, revision };
            if (!await this.replace(key, expectedRevision, next))
                throw new PlayerSnapshot_1.SnapshotConflictError();
            return (0, PlayerSnapshot_1.snapshotJSON)({ ...snapshot, revision });
        }).finally(() => this.importing.delete(guildId));
    }
    async has(key) {
        await this.tail;
        return this.provider.has(key);
    }
    async keys(pattern) {
        await this.tail;
        return this.provider.keys(pattern);
    }
    clear() {
        return this.mutate(() => this.provider.clear());
    }
    mutate(operation) {
        if (this.closing)
            return Promise.reject(new Error('Database is shutting down'));
        const result = this.tail.then(operation);
        this.tail = result.catch(() => undefined);
        return result;
    }
    async flush() {
        await this.tail;
        await this.provider.flush?.();
    }
    shutdown() {
        if (!this.shutdownPromise) {
            this.closing = true;
            this.shutdownPromise = this.tail.then(async () => {
                const errors = [];
                try {
                    await this.provider.flush?.();
                }
                catch (error) {
                    errors.push(error);
                }
                try {
                    await this.provider.shutdown();
                }
                catch (error) {
                    errors.push(error);
                }
                if (errors.length === 1)
                    throw errors[0];
                if (errors.length)
                    throw new AggregateError(errors, 'Storage shutdown failed');
            });
        }
        return this.shutdownPromise;
    }
}
exports.DatabaseManager = DatabaseManager;
//# sourceMappingURL=DatabaseManager.js.map