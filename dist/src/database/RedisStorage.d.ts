import type { Manager } from '../core/Manager';
import type { StorageAdapter } from './StorageAdapter';
export interface RedisCommandClient {
    sendCommand(args: string[]): Promise<unknown>;
}
export interface RedisStorageOptions {
    client: RedisCommandClient;
    namespace: string;
}
export declare class RedisStorage implements StorageAdapter {
    private readonly client;
    private readonly prefix;
    private initialized;
    private stopped;
    constructor(options: RedisStorageOptions);
    init(_manager: Manager): Promise<void>;
    private send;
    private segments;
    private locate;
    private decode;
    private scan;
    get<T>(path: string): Promise<T | undefined>;
    set<T>(path: string, value: T): Promise<void>;
    remove(path: string): Promise<boolean>;
    has(path: string): Promise<boolean>;
    compareAndSet<T>(path: string, revision: string | null, value: T | undefined): Promise<boolean>;
    private leaves;
    keys(pattern?: string): Promise<string[]>;
    clear(): Promise<void>;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
}
