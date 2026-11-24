import type { Writable } from 'node:stream';
export type TerminalPriority = 'normal' | 'critical';
export type TerminalRejectReason = 'capacity' | 'closed' | 'stream-error' | 'invalid-record';
export type TerminalOptions = {
    stream?: Writable & {
        isTTY?: boolean;
        columns?: number;
    };
    maxQueued?: number;
    maxRecordBytes?: number;
    interactive?: boolean;
    color?: boolean;
    onRejected?: (reason: TerminalRejectReason, priority: TerminalPriority) => void;
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
export declare class TerminalCoordinator {
    private readonly options;
    private readonly stream;
    private readonly capacity;
    private readonly maxBytes;
    private readonly interactive;
    private readonly color;
    private readonly queue;
    private readonly waiters;
    private region?;
    private drawn;
    private blocked;
    private pumping;
    private closed;
    private closing;
    private closePromise?;
    private notifying;
    private failed;
    private accepted;
    private rejected;
    private evicted;
    private streamErrors;
    constructor(options?: TerminalOptions);
    get stats(): TerminalStats;
    private reject;
    write(text: string, priority?: TerminalPriority): boolean;
    acquire(): TerminalLease | undefined;
    private onResize;
    private onDrain;
    private onError;
    private onClose;
    private fail;
    private send;
    private pump;
    flush(signal?: AbortSignal): Promise<boolean>;
    close(signal?: AbortSignal): Promise<boolean>;
    private finishClose;
}
