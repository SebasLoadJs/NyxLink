import type { Manager } from "../core/Manager";
import type { StorageAdapter } from './StorageAdapter';
export declare class Memory implements StorageAdapter {
    protected store: Record<string, any>;
    init(_manager: Manager, _options?: any): Promise<void>;
    protected parts(key: string): string[];
    protected read<T>(key: string): T | undefined;
    get<T>(key: string): Promise<T | undefined>;
    compareAndSet<T>(key: string, expectedRevision: string | null, value: T | undefined): Promise<boolean>;
    set<T>(key: string, value: T): Promise<void>;
    protected storeValue<T>(key: string, value: T): void;
    has(key: string): Promise<boolean>;
    remove(key: string): Promise<boolean>;
    protected removeValue(key: string): boolean;
    keys(pattern?: string): Promise<string[]>;
    clear(): Promise<void>;
    shutdown(): Promise<void>;
}
