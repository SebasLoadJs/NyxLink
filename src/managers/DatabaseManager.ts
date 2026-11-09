import { Manager } from "../core/Manager";
import { Memory } from "../database/Memory";
import { Local } from "../database/Local";
import type { StorageAdapter } from '../database/StorageAdapter';
import { randomUUID } from 'node:crypto';
import { PlayerSnapshotCodec, SnapshotConflictError, SnapshotValidationError, recordRevision, snapshotJSON, type PlayerSnapshot } from '../database/PlayerSnapshot';

function copyPlayerValue<T>(value: T, ancestors = new Set<object>()): T {
  if (value === null || typeof value !== 'object') {
    return ['function', 'symbol', 'bigint'].includes(typeof value) ? snapshotJSON(value) : value;
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null || typeof (value as any).toJSON === 'function') return snapshotJSON(value);
  if (ancestors.has(value)) throw new SnapshotValidationError('Snapshot must not contain circular metadata');
  ancestors.add(value);
  // Queue persistence is frequent: copy plain metadata once, preserving legacy undefined fields.
  const copy: any = Array.isArray(value) ? new Array(value.length) : {};
  for (const key of Object.keys(value)) {
    const item = copyPlayerValue(value[key], ancestors);
    if (key === '__proto__') Object.defineProperty(copy, key, { value: item, enumerable: true, writable: true, configurable: true });
    else copy[key] = item;
  }
  ancestors.delete(value);
  return copy;
}

export class DatabaseManager {
  public provider: StorageAdapter;
  private tail: Promise<unknown> = Promise.resolve();
  private closing = false;
  private shutdownPromise?: Promise<void>;
  private readonly importing = new Set<string>();
  private manager: Manager;
  private dbConfig: { type: 'memory' | 'local'; options?: any; };

  constructor(manager: Manager) {
    this.manager = manager;
    this.dbConfig = this.manager.options.database || { type: 'memory' };
    if (this.manager.options.database?.adapter) {
      this.provider = this.manager.options.database.adapter;
      return;
    }
    
    switch (this.dbConfig.type) {
      case 'local':
        this.provider = new Local();
        break;
      case 'memory':
      default:
        this.provider = new Memory();
        break;
    }
  }

  public async initialize(): Promise<void> {
    await this.provider.init(this.manager, this.dbConfig.options);
  }

  public async get<T>(key: string): Promise<T | undefined> {
    await this.tail;
    const value = await this.provider.get<T>(key);
    return value !== undefined && (key === 'players' || /^players\.(\d{17,20})(?:\.|$)/.test(key)) ? copyPlayerValue(value) : value;
  }

  public set<T>(key: string, value: T): Promise<void> {
    if (/^players\.\d{17,20}(?:\.|$)/.test(key)) {
      // Freeze queued input now, before the caller can mutate its metadata.
      let frozen: T;
      try { frozen = value === undefined ? value : copyPlayerValue(value); }
      catch (error) { return Promise.reject(error); }
      return this.mutate(async () => { await this.changePlayer(key, frozen, value === undefined); });
    }
    return this.mutate(() => this.provider.set(key, value));
  }

  public remove(key: string): Promise<boolean> {
    if (/^players\.\d{17,20}(?:\.|$)/.test(key)) return this.mutate(() => this.changePlayer(key, undefined, true));
    return this.mutate(() => this.provider.remove(key));
  }

  private async changePlayer(key: string, value: unknown, deleting: boolean): Promise<boolean> {
    const [namespace, guildId, ...parts] = key.split('.');
    if (parts.some(part => !part || ['__proto__', 'constructor', 'prototype'].includes(part)) || ['revision', 'schemaVersion'].includes(parts[0])) throw new TypeError('Invalid player storage path');
    const root = `${namespace}.${guildId}`;
    for (let attempt = 0; attempt < 8; attempt++) {
      const previous = await this.provider.get<Record<string, any>>(root);
      const revision = recordRevision(previous);
      if (deleting && previous === undefined) return false;
      // Published records are immutable through this manager; copy only the changed path.
      const candidate = parts.length ? { ...previous } : deleting ? undefined : value;
      if (candidate !== undefined && (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))) throw new TypeError('Stored player must be an object');
      const next = candidate as Record<string, any> | undefined;
      if (parts.length) {
        let parent = next;
        for (const part of parts.slice(0, -1)) {
          if (!Object.hasOwn(parent, part) || !parent[part] || typeof parent[part] !== 'object') {
            if (deleting) return false;
            parent[part] = {};
          } else {
            parent[part] = Array.isArray(parent[part]) ? [...parent[part]] : { ...parent[part] };
          }
          parent = parent[part];
        }
        const field = parts.at(-1)!;
        if (deleting) {
          if (!Object.hasOwn(parent, field)) return false;
          delete parent[field];
        } else parent[field] = value;
      }
      if (next !== undefined) {
        recordRevision(next);
        next.schemaVersion = 1;
        next.revision = randomUUID();
      }
      if (await this.replace(root, revision, next)) return true;
    }
    throw new SnapshotConflictError();
  }

  private async replace(key: string, revision: string | null, value: unknown): Promise<boolean> {
    if (this.provider.compareAndSet) return this.provider.compareAndSet(key, revision, value);
    // Legacy adapters retain the manager's serial queue, not cross-process CAS guarantees.
    if (value === undefined) await this.provider.remove(key);
    else await this.provider.set(key, value);
    return true;
  }

  /** @internal Synchronous creation must not race an asynchronous snapshot replacement. */
  public isImportingPlayer(guildId: string): boolean { return this.importing.has(guildId); }

  public async exportPlayer(guildId: string): Promise<PlayerSnapshot | undefined> {
    if (!/^\d{17,20}$/.test(guildId)) throw new TypeError('Invalid snapshot guild');
    const record = await this.get(`players.${guildId}`);
    if (record === undefined) return undefined;
    const snapshot = PlayerSnapshotCodec.fromRecord(record);
    if (snapshot.data.guildId !== guildId) throw new SnapshotValidationError('Snapshot guild does not match its storage key');
    return snapshot;
  }

  public importPlayer(input: unknown, expectedRevision: string | null): Promise<PlayerSnapshot> {
    let snapshot: PlayerSnapshot;
    try { snapshot = PlayerSnapshotCodec.parse(input); }
    catch (error) { return Promise.reject(error); }
    const guildId = snapshot.data.guildId;
    if (expectedRevision !== null && (typeof expectedRevision !== 'string' || !expectedRevision || expectedRevision.length > 256)) return Promise.reject(new TypeError('Expected snapshot revision is required'));
    if (this.importing.has(guildId) || this.manager.players.has(guildId)) return Promise.reject(new SnapshotConflictError());
    this.importing.add(guildId);
    return this.mutate(async () => {
      const key = `players.${guildId}`;
      const previous = await this.provider.get(key);
      if (this.manager.players.has(guildId) || recordRevision(previous) !== expectedRevision) throw new SnapshotConflictError();
      const revision = randomUUID();
      const next = { ...snapshot.data, schemaVersion: 1, revision };
      if (!await this.replace(key, expectedRevision, next)) throw new SnapshotConflictError();
      return snapshotJSON({ ...snapshot, revision });
    }).finally(() => this.importing.delete(guildId));
  }

  public async has(key: string): Promise<boolean> {
    await this.tail;
    return this.provider.has(key);
  }

  public async keys(pattern?: string): Promise<string[]> {
    await this.tail;
    return this.provider.keys(pattern);
  }

  public clear(): Promise<void> {
    return this.mutate(() => this.provider.clear());
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('Database is shutting down'));
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }

  public async flush(): Promise<void> {
    await this.tail;
    await this.provider.flush?.();
  }

  public shutdown(): Promise<void> {
    if (!this.shutdownPromise) {
      this.closing = true;
      this.shutdownPromise = this.tail.then(async () => {
        const errors: unknown[] = [];
        try { await this.provider.flush?.(); } catch (error) { errors.push(error); }
        try { await this.provider.shutdown(); } catch (error) { errors.push(error); }
        if (errors.length === 1) throw errors[0];
        if (errors.length) throw new AggregateError(errors, 'Storage shutdown failed');
      });
    }
    return this.shutdownPromise;
  }
}
