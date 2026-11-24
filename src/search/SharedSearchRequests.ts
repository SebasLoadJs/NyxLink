/** Bounded, opt-in backend request coalescing with independent caller cancellation. */
export class SharedSearchRequests<T> {
    private readonly entries = new Map<string, { controller: AbortController; promise: Promise<T>; users: number }>();
    async run(key: string, signal: AbortSignal, load: (signal: AbortSignal) => Promise<T>): Promise<T> {
        signal.throwIfAborted();
        let entry = this.entries.get(key);
        if (!entry) {
            if (this.entries.size >= 128) return load(signal);
            const controller = new AbortController();
            const created: { controller: AbortController; users: number; promise: Promise<T> } = { controller, users: 0, promise: Promise.resolve(undefined as T) };
            created.promise = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return load(controller.signal); })
                .finally(() => { if (this.entries.get(key) === created) this.entries.delete(key); });
            entry = created;
            this.entries.set(key, entry);
        }
        entry.users++;
        try {
            return await new Promise<T>((resolve, reject) => {
                const shared = entry!;
                const abort = () => { cleanup(); reject(signal.reason ?? new Error('Search aborted')); };
                const cancelShared = () => { cleanup(); reject(shared.controller.signal.reason ?? new Error('Search aborted')); };
                const cleanup = () => {
                    signal.removeEventListener('abort', abort);
                    shared.controller.signal.removeEventListener('abort', cancelShared);
                };
                signal.addEventListener('abort', abort, { once: true });
                shared.controller.signal.addEventListener('abort', cancelShared, { once: true });
                shared.promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
                if (signal.aborted) abort();
                else if (shared.controller.signal.aborted) cancelShared();
            });
        } finally {
            entry.users--;
            if (!entry.users) {
                if (this.entries.get(key) === entry) this.entries.delete(key);
                entry.controller.abort(new Error('No search subscribers remain'));
            }
        }
    }
    close(): void {
        for (const entry of this.entries.values()) entry.controller.abort(new Error('Manager is shut down'));
        this.entries.clear();
    }
}
