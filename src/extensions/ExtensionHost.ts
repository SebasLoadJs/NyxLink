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
export interface ExtensionOptions { setupTimeoutMs?: number; cleanupTimeoutMs?: number }
export class ExtensionLifecycleError extends Error {
    public readonly code: 'EXTENSION_SETUP_FAILED' | 'EXTENSION_CLEANUP_FAILED' | 'EXTENSION_HANDLER_FAILED';
    constructor(public readonly extension: string, phase: 'setup' | 'cleanup' | 'handler', cause: unknown) {
        super(`Extension ${extension} ${phase} failed`, { cause });
        this.name = 'ExtensionLifecycleError';
        this.code = phase === 'setup' ? 'EXTENSION_SETUP_FAILED' : phase === 'cleanup' ? 'EXTENSION_CLEANUP_FAILED' : 'EXTENSION_HANDLER_FAILED';
    }
}
type Entry = { extension: NyxExtension; controller: AbortController; listeners: Set<() => void>; ready: boolean; cleanupTimeout: number; disposing?: Promise<void> };

/** Optional lifecycle for trusted extensions. Extensions own their external resources. */
export class ExtensionHost {
    private readonly entries = new Map<string, Entry>();
    private closed = false;
    private closing?: Promise<void>;
    constructor(private readonly manager: Manager) {}

    private report(error: ExtensionLifecycleError, notify = true): void {
        try { this.manager.logger?.reportError(error, { extension: error.extension }); } catch { /* diagnostics are isolated */ }
        if (notify) { try { this.manager.emit('extensionError', error.extension, error); } catch { /* observer failure */ } }
    }

    async register(extension: NyxExtension, options: ExtensionOptions = {}): Promise<() => Promise<void>> {
        if (this.closed || this.manager.destroyed) throw new Error('Extension host is closed');
        if (!extension || typeof extension.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(extension.name) || typeof extension.setup !== 'function' ||
            extension.dispose !== undefined && typeof extension.dispose !== 'function') throw new TypeError('Invalid NyxLink extension');
        if (this.entries.has(extension.name)) throw new Error('Extension name is already registered');
        extension = { name: extension.name, setup: extension.setup.bind(extension), dispose: extension.dispose?.bind(extension) };
        const setupTimeout = options.setupTimeoutMs ?? 10000, cleanupTimeout = options.cleanupTimeoutMs ?? 1000;
        for (const timeout of [setupTimeout, cleanupTimeout]) if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw new TypeError('Invalid extension lifecycle timeout');
        const entry: Entry = { extension, controller: new AbortController(), listeners: new Set(), ready: false, cleanupTimeout };
        this.entries.set(extension.name, entry);
        const active = () => entry.ready && !entry.controller.signal.aborted && !this.manager.destroyed && this.entries.get(extension.name) === entry;
        const context: ExtensionContext = {
            manager: this.manager, signal: entry.controller.signal,
            on: (event, listener) => {
                if (entry.controller.signal.aborted) return () => {};
                const detach = this.manager.on(event, ((...args: unknown[]) => {
                    if (!active()) return;
                    try {
                        const result = (listener as (...values: unknown[]) => void | Promise<void>)(...args);
                        if (result) void Promise.resolve(result).catch(error => { if (active()) this.report(new ExtensionLifecycleError(extension.name, 'handler', error), event !== 'extensionError'); });
                    } catch (error) { if (active()) this.report(new ExtensionLifecycleError(extension.name, 'handler', error), event !== 'extensionError'); }
                }) as IManagerEvents[typeof event]);
                const dispose = () => { detach(); entry.listeners.delete(dispose); };
                entry.listeners.add(dispose);
                return dispose;
            },
        };
        let aborted: (() => void) | undefined;
        const timeout = setTimeout(() => entry.controller.abort(new Error('Extension setup timed out')), setupTimeout);
        try {
            const cancellation = new Promise<never>((_, reject) => {
                aborted = () => reject(entry.controller.signal.reason);
                entry.controller.signal.addEventListener('abort', aborted, { once: true });
            });
            await Promise.race([Promise.resolve().then(() => { entry.controller.signal.throwIfAborted(); return extension.setup(context); }), cancellation]);
            entry.controller.signal.throwIfAborted();
            if (this.closed || this.manager.destroyed || this.entries.get(extension.name) !== entry) throw new Error('Extension removed during setup');
            entry.ready = true;
            return () => this.dispose(entry);
        } catch (cause) {
            const failure = new ExtensionLifecycleError(extension.name, 'setup', cause);
            this.report(failure);
            try { await this.dispose(entry); }
            catch (cleanup) { throw new AggregateError([failure, cleanup], 'Extension setup and cleanup failed'); }
            throw failure;
        } finally {
            clearTimeout(timeout);
            if (aborted) entry.controller.signal.removeEventListener('abort', aborted);
        }
    }

    private dispose(entry: Entry): Promise<void> {
        if (entry.disposing) return entry.disposing;
        entry.ready = false;
        entry.controller.abort(new Error('Extension removed'));
        for (const detach of entry.listeners) detach();
        entry.listeners.clear();
        entry.disposing = Promise.resolve().then(async () => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                await Promise.race([Promise.resolve().then(() => entry.extension.dispose?.()), new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Extension cleanup timed out')), entry.cleanupTimeout);
                })]);
            } catch (cause) {
                const failure = new ExtensionLifecycleError(entry.extension.name, 'cleanup', cause);
                this.report(failure);
                throw failure;
            } finally {
                if (timer) clearTimeout(timer);
                if (this.entries.get(entry.extension.name) === entry) this.entries.delete(entry.extension.name);
            }
        });
        return entry.disposing;
    }

    async remove(name: string): Promise<boolean> {
        const entry = this.entries.get(name);
        if (!entry) return false;
        await this.dispose(entry);
        return true;
    }

    close(): Promise<void> {
        if (this.closing) return this.closing;
        this.closed = true;
        this.closing = Promise.allSettled([...this.entries.values()].map(entry => this.dispose(entry))).then(results => {
            const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map(result => result.reason);
            if (failures.length) throw new AggregateError(failures, 'Extension cleanup failed');
        });
        return this.closing;
    }
}
