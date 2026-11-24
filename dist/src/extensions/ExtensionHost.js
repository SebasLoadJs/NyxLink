"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtensionHost = exports.ExtensionLifecycleError = void 0;
const ManagerLogRoute_1 = require("../logging/ManagerLogRoute");
class ExtensionLifecycleError extends Error {
    extension;
    code;
    constructor(extension, phase, cause) {
        super(`Extension ${extension} ${phase} failed`, { cause });
        this.extension = extension;
        this.name = 'ExtensionLifecycleError';
        this.code = phase === 'setup' ? 'EXTENSION_SETUP_FAILED' : phase === 'cleanup' ? 'EXTENSION_CLEANUP_FAILED' : 'EXTENSION_HANDLER_FAILED';
    }
}
exports.ExtensionLifecycleError = ExtensionLifecycleError;
class ExtensionHost {
    manager;
    entries = new Map();
    closed = false;
    closing;
    constructor(manager) {
        this.manager = manager;
    }
    report(error, notify = true) {
        try {
            (0, ManagerLogRoute_1.getManagerLogRoute)(this.manager)?.recordExtensionFailure();
        }
        catch { }
        if (notify) {
            try {
                this.manager.emit('extensionError', error.extension, error);
            }
            catch { }
        }
    }
    async register(extension, options = {}) {
        if (this.closed || this.manager.destroyed)
            throw new Error('Extension host is closed');
        if (!extension || typeof extension.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(extension.name) || typeof extension.setup !== 'function' ||
            extension.dispose !== undefined && typeof extension.dispose !== 'function')
            throw new TypeError('Invalid NyxLink extension');
        if (this.entries.has(extension.name))
            throw new Error('Extension name is already registered');
        extension = { name: extension.name, setup: extension.setup.bind(extension), dispose: extension.dispose?.bind(extension) };
        const setupTimeout = options.setupTimeoutMs ?? 10000, cleanupTimeout = options.cleanupTimeoutMs ?? 1000;
        for (const timeout of [setupTimeout, cleanupTimeout])
            if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000)
                throw new TypeError('Invalid extension lifecycle timeout');
        const entry = { extension, controller: new AbortController(), listeners: new Set(), ready: false, cleanupTimeout };
        this.entries.set(extension.name, entry);
        const active = () => entry.ready && !entry.controller.signal.aborted && !this.manager.destroyed && this.entries.get(extension.name) === entry;
        const context = {
            manager: this.manager, signal: entry.controller.signal,
            on: (event, listener) => {
                if (entry.controller.signal.aborted)
                    return () => { };
                const detach = this.manager.on(event, ((...args) => {
                    if (!active())
                        return;
                    try {
                        const result = listener(...args);
                        if (result)
                            void Promise.resolve(result).catch(error => { if (active())
                                this.report(new ExtensionLifecycleError(extension.name, 'handler', error), event !== 'extensionError'); });
                    }
                    catch (error) {
                        if (active())
                            this.report(new ExtensionLifecycleError(extension.name, 'handler', error), event !== 'extensionError');
                    }
                }));
                const dispose = () => { detach(); entry.listeners.delete(dispose); };
                entry.listeners.add(dispose);
                return dispose;
            },
        };
        let aborted;
        const timeout = setTimeout(() => entry.controller.abort(new Error('Extension setup timed out')), setupTimeout);
        try {
            const cancellation = new Promise((_, reject) => {
                aborted = () => reject(entry.controller.signal.reason);
                entry.controller.signal.addEventListener('abort', aborted, { once: true });
            });
            await Promise.race([Promise.resolve().then(() => { entry.controller.signal.throwIfAborted(); return extension.setup(context); }), cancellation]);
            entry.controller.signal.throwIfAborted();
            if (this.closed || this.manager.destroyed || this.entries.get(extension.name) !== entry)
                throw new Error('Extension removed during setup');
            entry.ready = true;
            return () => this.dispose(entry);
        }
        catch (cause) {
            const failure = new ExtensionLifecycleError(extension.name, 'setup', cause);
            this.report(failure);
            try {
                await this.dispose(entry);
            }
            catch (cleanup) {
                throw new AggregateError([failure, cleanup], 'Extension setup and cleanup failed');
            }
            throw failure;
        }
        finally {
            clearTimeout(timeout);
            if (aborted)
                entry.controller.signal.removeEventListener('abort', aborted);
        }
    }
    dispose(entry) {
        if (entry.disposing)
            return entry.disposing;
        entry.ready = false;
        entry.controller.abort(new Error('Extension removed'));
        for (const detach of entry.listeners)
            detach();
        entry.listeners.clear();
        entry.disposing = Promise.resolve().then(async () => {
            let timer;
            try {
                await Promise.race([Promise.resolve().then(() => entry.extension.dispose?.()), new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('Extension cleanup timed out')), entry.cleanupTimeout);
                    })]);
            }
            catch (cause) {
                const failure = new ExtensionLifecycleError(entry.extension.name, 'cleanup', cause);
                this.report(failure);
                throw failure;
            }
            finally {
                if (timer)
                    clearTimeout(timer);
                if (this.entries.get(entry.extension.name) === entry)
                    this.entries.delete(entry.extension.name);
            }
        });
        return entry.disposing;
    }
    async remove(name) {
        const entry = this.entries.get(name);
        if (!entry)
            return false;
        await this.dispose(entry);
        return true;
    }
    close() {
        if (this.closing)
            return this.closing;
        this.closed = true;
        this.closing = Promise.allSettled([...this.entries.values()].map(entry => this.dispose(entry))).then(results => {
            const failures = results.filter((result) => result.status === 'rejected').map(result => result.reason);
            if (failures.length)
                throw new AggregateError(failures, 'Extension cleanup failed');
        });
        return this.closing;
    }
}
exports.ExtensionHost = ExtensionHost;
//# sourceMappingURL=ExtensionHost.js.map