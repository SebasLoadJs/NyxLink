import type { Writable } from 'node:stream';

export type TerminalPriority = 'normal' | 'critical';
export type TerminalRejectReason = 'capacity' | 'closed' | 'stream-error' | 'invalid-record';
export type TerminalOptions = {
    stream?: Writable & { isTTY?: boolean; columns?: number };
    maxQueued?: number;
    maxRecordBytes?: number;
    interactive?: boolean;
    /** Called synchronously on rejection; use an independent destination, not this coordinator. */
    onRejected?: (reason: TerminalRejectReason, priority: TerminalPriority) => void;
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
const CLEAR = '\r\x1b[2K';
// Deliberately restrict the first dynamic region to printable ASCII. A future
// visual renderer can supply measured Unicode cells without risking wrapping.
const asciiLine = (value: string) => value.replace(/[^\x20-\x7e]/g, ' ');
const plain = (value: string) => value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, '');

/** One explicitly owned output stream, bounded persistent queue and one temporary line.
 * No timers, signal handlers or cursor hiding are installed on import.
 */
export class TerminalCoordinator {
    private readonly stream: NonNullable<TerminalOptions['stream']>;
    private readonly capacity: number;
    private readonly maxBytes: number;
    private readonly interactive: boolean;
    private readonly queue: Pending[] = [];
    private readonly waiters = new Set<(ok: boolean) => void>();
    private region?: { owner: symbol; text: string };
    private drawn = '';
    private blocked = false;
    private pumping = false;
    private closed = false;
    private closing = false;
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
        this.stream.on('drain', this.onDrain);
        this.stream.on('error', this.onError);
        this.stream.on('close', this.onClose);
    }

    get stats(): TerminalStats {
        return { queued: this.queue.length, accepted: this.accepted, rejected: this.rejected,
            evicted: this.evicted, streamErrors: this.streamErrors };
    }

    private reject(reason: TerminalRejectReason, priority: TerminalPriority): false {
        this.rejected++;
        try { this.options.onRejected?.(reason, priority); } catch { /* never break audio */ }
        return false;
    }

    write(text: string, priority: TerminalPriority = 'normal'): boolean {
        if (this.closed || this.closing) return this.reject('closed', priority);
        if (this.failed) return this.reject('stream-error', priority);
        if (typeof text !== 'string' || Buffer.byteLength(text) > this.maxBytes) {
            return this.reject('invalid-record', priority);
        }
        if (this.queue.length >= this.capacity) {
            const normal = priority === 'critical' ? this.queue.findIndex(item => item.priority === 'normal') : -1;
            if (normal < 0) return this.reject('capacity', priority);
            this.queue.splice(normal, 1);
            this.evicted++;
            this.reject('capacity', 'normal');
        }
        // No caller-supplied control sequences reach the output stream.
        this.queue.push({ text: plain(text).replace(/\n+$/, '') + '\n', priority });
        this.accepted++;
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
        for (const item of this.queue.splice(0)) this.reject('stream-error', item.priority);
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
                if (this.failed) this.reject('stream-error', item.priority);
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
    async close(signal?: AbortSignal): Promise<boolean> {
        if (this.closed) return !this.failed;
        this.closing = true;
        this.region = undefined;
        this.pump();
        const drained = await this.flush(signal);
        if (!drained) {
            for (const item of this.queue.splice(0)) this.reject(this.failed ? 'stream-error' : 'closed', item.priority);
        }
        this.closed = true;
        this.stream.off('drain', this.onDrain);
        this.stream.off('error', this.onError);
        this.stream.off('close', this.onClose);
        for (const done of this.waiters) done(false);
        this.waiters.clear();
        return drained;
    }
}
