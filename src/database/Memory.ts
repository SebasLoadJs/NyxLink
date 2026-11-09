import type { Manager } from "../core/Manager";
import type { StorageAdapter } from './StorageAdapter';

/** Volatile dotted-key storage, scoped to one Manager and never written to disk. */
export class Memory implements StorageAdapter {
  protected store: Record<string, any> = Object.create(null);

  public async init(_manager: Manager, _options?: any): Promise<void> {}

  protected parts(key: string): string[] {
    const parts = key.split('.');
    if (parts.some(part => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) {
      throw new TypeError('Invalid memory storage path');
    }
    return parts;
  }

  protected read<T>(key: string): T | undefined {
    if (!key) return undefined;
    let value: any = this.store;
    let parts: string[];
    try { parts = this.parts(key); } catch { return undefined; }
    for (const part of parts) {
      if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
      value = value[part];
    }
    return value as T;
  }

  public async get<T>(key: string): Promise<T | undefined> { return this.read<T>(key); }

  public async compareAndSet<T>(key: string, expectedRevision: string | null, value: T | undefined): Promise<boolean> {
    this.parts(key);
    const current = this.read<{ revision?: string }>(key);
    if ((current?.revision ?? null) !== expectedRevision) return false;
    // No await between comparison and mutation: concurrent managers share this atomic step.
    if (value === undefined) this.removeValue(key);
    else this.storeValue(key, value);
    return true;
  }

  public async set<T>(key: string, value: T): Promise<void> { this.storeValue(key, value); }

  protected storeValue<T>(key: string, value: T): void {
    if (!key) return;
    const parts = this.parts(key);
    let current = this.store;
    for (const part of parts.slice(0, -1)) {
      if (!Object.hasOwn(current, part) || !current[part] || typeof current[part] !== 'object') current[part] = Object.create(null);
      current = current[part];
    }
    current[parts.at(-1)!] = value;
  }

  public async has(key: string): Promise<boolean> { return await this.get(key) !== undefined; }

  public async remove(key: string): Promise<boolean> { return this.removeValue(key); }

  protected removeValue(key: string): boolean {
    if (!key) return false;
    const parts = this.parts(key);
    let current: any = this.store;
    for (const part of parts.slice(0, -1)) {
      if (!current || typeof current !== 'object' || !Object.hasOwn(current, part)) return false;
      current = current[part];
    }
    const last = parts.at(-1)!;
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, last)) return false;
    delete current[last];
    return true;
  }

  public async keys(pattern?: string): Promise<string[]> {
    const keys: string[] = [];
    const ancestors = new Set<object>();
    const visit = (object: Record<string, any>, prefix: string) => {
      ancestors.add(object);
      for (const [key, value] of Object.entries(object)) {
        const full = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value) && !ancestors.has(value)) visit(value, full);
        else keys.push(full);
      }
      ancestors.delete(object);
    };
    visit(this.store, '');
    if (!pattern || pattern === '*') return keys;
    const escaped = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    const matcher = new RegExp(`^${escaped}$`);
    return keys.filter(key => matcher.test(key));
  }

  public async clear(): Promise<void> { this.store = Object.create(null); }
  public async shutdown(): Promise<void> { await this.clear(); }
}
