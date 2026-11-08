import type { Manager } from '../core/Manager';

/** One adapter instance belongs to one Manager; local storage is single-process. */
export interface StorageAdapter {
    init(manager: Manager, options?: any): Promise<void>;
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    remove(key: string): Promise<boolean>;
    has(key: string): Promise<boolean>;
    keys(pattern?: string): Promise<string[]>;
    clear(): Promise<void>;
    flush?(): Promise<void>;
    /** Atomically compare the stored record's revision (null for absent/legacy) and replace/delete it. */
    compareAndSet?<T>(key: string, expectedRevision: string | null, value: T | undefined): Promise<boolean>;
    shutdown(): Promise<void>;
}
