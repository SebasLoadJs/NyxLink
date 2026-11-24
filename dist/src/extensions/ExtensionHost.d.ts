import type { Manager } from '../core/Manager';
import type { IManagerEvents } from '../typings/Interfaces';
export interface ExtensionContext {
    readonly manager: Manager;
    readonly signal: AbortSignal;
    on<E extends keyof IManagerEvents>(event: E, listener: (...args: Parameters<IManagerEvents[E]>) => void | Promise<void>): () => void;
}
export interface NyxExtension {
    readonly name: string;
    setup(context: ExtensionContext): void | Promise<void>;
    dispose?(): void | Promise<void>;
}
export interface ExtensionOptions {
    setupTimeoutMs?: number;
    cleanupTimeoutMs?: number;
}
export declare class ExtensionLifecycleError extends Error {
    readonly extension: string;
    readonly code: 'EXTENSION_SETUP_FAILED' | 'EXTENSION_CLEANUP_FAILED' | 'EXTENSION_HANDLER_FAILED';
    constructor(extension: string, phase: 'setup' | 'cleanup' | 'handler', cause: unknown);
}
export declare class ExtensionHost {
    private readonly manager;
    private readonly entries;
    private closed;
    private closing?;
    constructor(manager: Manager);
    private report;
    register(extension: NyxExtension, options?: ExtensionOptions): Promise<() => Promise<void>>;
    private dispose;
    remove(name: string): Promise<boolean>;
    close(): Promise<void>;
}
