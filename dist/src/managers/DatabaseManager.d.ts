import { Manager } from "../core/Manager";
import type { StorageAdapter } from '../database/StorageAdapter';
import { type PlayerSnapshot } from '../database/PlayerSnapshot';
export declare class DatabaseManager {
    provider: StorageAdapter;
    private tail;
    private closing;
    private shutdownPromise?;
    private readonly importing;
    private manager;
    private dbConfig;
    constructor(manager: Manager);
    initialize(): Promise<void>;
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    remove(key: string): Promise<boolean>;
    private changePlayer;
    private replace;
    isImportingPlayer(guildId: string): boolean;
    exportPlayer(guildId: string): Promise<PlayerSnapshot | undefined>;
    importPlayer(input: unknown, expectedRevision: string | null): Promise<PlayerSnapshot>;
    has(key: string): Promise<boolean>;
    keys(pattern?: string): Promise<string[]>;
    clear(): Promise<void>;
    private mutate;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
}
