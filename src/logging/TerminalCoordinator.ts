import type { Writable } from 'node:stream';

export type TerminalPriority = 'normal' | 'critical';
export type TerminalRejectReason = 'capacity' | 'closed' | 'stream-error' | 'invalid-record';
export type TerminalOptions = {
    stream?: Writable & { isTTY?: boolean; columns?: number };
    maxQueued?: number;
    maxRecordBytes?: number;
    interactive?: boolean;
    /** Preserve only SGR styling in an eligible interactive terminal. */
    color?: boolean;
    /** Called synchronously on rejection; use an independent destination, not this coordinator. */
    onRejected?: (reason: TerminalRejectReason, priority: TerminalPriority) => void;
    /** Optional independent fallback for a sanitized critical record rejected before delivery. */
    onCriticalRejected?: (reason: TerminalRejectReason, text: string) => void;
};
export type TerminalStats = {
    queued: number;
    accepted: number;
    rejected: number;
    evicted: number;
    streamErrors: number;
};
export interface TerminalLease {
    update(text: string): boolean;
    release(): void;
}
type Pending = { text: string; priority: TerminalPriority };
const owners = new WeakSet<object>();
const CLEAR = '\r\x1b[2K';
// Deliberately restrict the first dynamic region to printable ASCII. A future
// visual renderer can supply measured Unicode cells without risking wrapping.
const asciiLine = (value: string) => value.replace(/[^\x20-\x7e]/g, ' ');
const plain = (value: string, color = false) => value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, match => color && /^\x1b\[[0-9;]{0,64}m$/.test(match) ? match : '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/[\x00-\x09\x0b-\x1a\x1c-\x1f\x7f-\x9f]|\x1b(?!\[[0-9;]{0,64}m)/g, '');

/** One explicitly owned output stream, bounded persistent queue and one temporary line.
 * No timers, signal handlers or cursor hiding are installed on import.
 */
export class TerminalCoordinator {
    private readonly stream: NonNullable<TerminalOptions['stream']>;
    private readonly capacity: number;
    private readonly maxBytes: number;
    private readonly interactive: boolean;
    private readonly color: boolean;
    private readonly queue: Pending[] = [];
    private readonly waiters = new Set<(ok: boolean) => void>();
    private region?: { owner: symbol; text: string };
    private drawn = '';
    private blocked = false;
    private pumping = false;
    private closed = false;
    private closing = false;
    private closePromise?: Promise<boolean>;
    private notifying = false;
    private failed = false;
    private accepted = 0;
    private rejected = 0;
    private evicted = 0;
    private streamErrors = 0;

    constructor(private readonly options: TerminalOptions = {}) {
        this.stream = options.stream ?? process.stdout;
        this.capacity = options.maxQueued ?? 256;
        this.maxBytes = options.maxRecordBytes ?? 65536;
        if (!Number.isSafeInteger(this.capacity) || this.capacity < 1 || this.capacity > 10000 ||
            !Number.isSafeInteger(this.maxBytes) || this.maxBytes < 128 || this.maxBytes > 1048576) {
            throw new RangeError('Invalid terminal queue or record limit');
        }
        this.interactive = options.interactive === true && this.stream.isTTY === true &&
            !process.env.CI && !('NO_COLOR' in process.env) && process.env.TERM !== 'dumb';
        this.color = this.interactive && options.color === true;
        if (owners.has(this.stream)) throw new Error('Terminal stream already owned');
        owners.add(this.stream);
        if (this.interactive) this.stream.on('resize', this.onResize);
        this.stream.on('drain', this.onDrain);
        this.stream.on('error', this.onError);
        this.stream.on('close', this.onClose);
    }

    get stats(): TerminalStats {
        return { queued: this.queue.length, accepted: this.accepted, rejected: this.rejected,
            evicted: this.evicted, streamErrors: this.streamErrors };
    }

    private reject(reason: TerminalRejectReason, priority: TerminalPriority, text?: string): false {
        this.rejected++;
        // A host fallback must not recurse indefinitely into this coordinator.
        if (this.notifying) return false;
        this.notifying = true;
        try {
            try { this.options.onRejected?.(reason, priority); } catch {}
            if (priority === 'critical' && text !== undefined) {
                try { this.options.onCriticalRejected?.(reason, plain(text)); } catch {}
            }
        } finally { this.notifying = false; }
        return false;
    }

    write(text: string, priority: TerminalPriority = 'normal'): boolean {
        if (typeof text !== 'string' || Buffer.byteLength(text) > this.maxBytes) {
            return this.reject('invalid-record', priority);
        }
        const safe = plain(text, this.color).replace(/\n+$/, '');
        if (this.closed || this.closing || this.notifying) return this.reject('closed', priority, safe);
        if (this.failed) return this.reject('stream-error', priority, safe);
        let evicted = false;
        if (this.queue.length >= this.capacity) {
            const normal = priority === 'critical' ? this.queue.findIndex(item => item.priority === 'normal') : -1;
            if (normal < 0) return this.reject('capacity', priority, safe);
            this.queue.splice(normal, 1);
            this.evicted++;
            evicted = true;
        }
        this.queue.push({ text: safe + (this.color && safe.includes('\x1b') ? '\x1b[0m' : '') + '\n', priority });
        this.accepted++;
        if (evicted) this.reject('capacity', 'normal');
        this.pump();
        return !this.failed;
    }

    acquire(): TerminalLease | undefined {
        if (!this.interactive || this.closed || this.closing || this.failed || this.region) return undefined;
        const owner = Symbol('terminal-region');
        this.region = { owner, text: '' };
        return {
            update: text => {
                if (this.region?.owner !== owner || this.closed || this.closing || this.failed) return false;
                this.region.text = asciiLine(text).slice(0, 4096);
                this.pump();
                return !this.failed;
            },
            release: () => {
                if (this.region?.owner !== owner) return;
                this.region = undefined;
                this.pump();
            },
        };
    }

    private onResize = (): void => { this.pump(); };

    private onDrain = (): void => {
        this.blocked = false;
        this.pump();
    };
    private onError = (): void => { this.fail(); };
    private onClose = (): void => { this.fail(); };

    private fail(): void {
        if (this.failed || this.closed) return;
        this.failed = true;
        this.streamErrors++;
        for (const item of this.queue.splice(0)) this.reject('stream-error', item.priority, item.text);
        this.region = undefined;
        this.drawn = '';
        for (const done of this.waiters) done(false);
        this.waiters.clear();
    }

    private send(text: string): void {
        try { this.blocked = !this.stream.write(text); }
        catch { this.fail(); }
    }

    private pump(): void {
        if (this.pumping || this.blocked || this.closed || this.failed) return;
        this.pumping = true;
        try {
            while (!this.blocked && !this.failed && this.queue.length) {
                const item = this.queue.shift()!;
                const prefix = this.drawn ? CLEAR : '';
                this.drawn = '';
                this.send(prefix + item.text);
                if (this.failed) this.reject('stream-error', item.priority, item.text);
            }
            if (!this.blocked && !this.failed && !this.queue.length) {
                if (this.region && !this.closing) {
                    const width = Math.max(0, (this.stream.columns ?? 80) - 1);
                    const line = this.region.text.slice(0, width);
                    if (line !== this.drawn) {
                        this.drawn = line;
                        this.send(CLEAR + line);
                    }
                } else if (this.drawn) {
                    this.drawn = '';
                    this.send(CLEAR);
                }
            }
        } finally {
            this.pumping = false;
            if (!this.blocked && !this.queue.length && !this.failed) {
                for (const done of this.waiters) done(true);
                this.waiters.clear();
            }
        }
    }

    /** Wait for accepted writes to drain; the caller may abort without closing the host stream. */
    flush(signal?: AbortSignal): Promise<boolean> {
        if (this.failed || signal?.aborted) return Promise.resolve(false);
        if (!this.blocked && !this.queue.length) return Promise.resolve(true);
        return new Promise(resolve => {
            const done = (ok: boolean) => {
                this.waiters.delete(done);
                signal?.removeEventListener('abort', abort);
                resolve(ok);
            };
            const abort = () => done(false);
            this.waiters.add(done);
            signal?.addEventListener('abort', abort, { once: true });
        });
    }

    /** Releases ownership; never ends or destroys the host's output stream. */
    close(signal?: AbortSignal): Promise<boolean> {
        if (this.closePromise) return this.closePromise;
        // Publish the shared promise before any user callbacks can reenter.
        this.closePromise = Promise.resolve().then(() => this.finishClose(signal));
        this.closing = true;
        return this.closePromise;
    }

    private async finishClose(signal?: AbortSignal): Promise<boolean> {
        this.closing = true;
        this.region = undefined;
        this.pump();
        const drained = await this.flush(signal);
        if (!drained) {
            for (const item of this.queue.splice(0)) this.reject(this.failed ? 'stream-error' : 'closed', item.priority, item.text);
        }
        this.closed = true;
        if (this.interactive) this.stream.off('resize', this.onResize);
        owners.delete(this.stream);
        this.stream.off('drain', this.onDrain);
        this.stream.off('error', this.onError);
        this.stream.off('close', this.onClose);
        for (const done of this.waiters) done(false);
        this.waiters.clear();
        return drained;
    }
}
