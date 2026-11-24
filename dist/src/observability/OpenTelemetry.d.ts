import type { Manager } from '../core/Manager';
import type { SearchResult } from '../structures/SearchResult';
declare const operationNames: readonly ["nyxlink.rest", "nyxlink.player.play", "nyxlink.player.seek", "nyxlink.player.stop", "nyxlink.failover", "nyxlink.connect", "nyxlink.resolve", "nyxlink.node.select", "nyxlink.session.restore", "nyxlink.autoplay", "nyxlink.crossfade", "nyxlink.capabilities"];
export type TelemetryOperation = typeof operationNames[number];
export type TelemetryOutcome = 'success' | 'empty' | 'error' | 'cancelled' | 'resolved';
export declare function observeOperation<T>(manager: Manager, name: TelemetryOperation, operation: () => Promise<T>, classify?: (result: T) => TelemetryOutcome): Promise<T>;
export declare function observeSyncOperation<T>(manager: Manager, name: TelemetryOperation, operation: () => T, classify?: (result: T) => TelemetryOutcome): T;
type Attributes = Record<string, string>;
export interface TelemetryObservation {
    observe(value: number, attributes?: Attributes): void;
}
export interface TelemetryGauge {
    addCallback(callback: (result: TelemetryObservation) => void): void;
    removeCallback(callback: (result: TelemetryObservation) => void): void;
}
export interface TelemetryMeter {
    createObservableGauge?(name: string, options?: {
        unit?: string;
    }): TelemetryGauge;
    createCounter(name: string): {
        add(value: number, attributes?: Attributes): void;
    };
    createHistogram(name: string, options?: {
        unit?: string;
    }): {
        record(value: number, attributes?: Attributes): void;
    };
}
export interface TelemetrySpan {
    setStatus(status: {
        code: 0 | 1 | 2;
    }): unknown;
    setAttribute(key: string, value: string): unknown;
    end(): void;
}
export interface TelemetryTracer {
    startSpan(name: string): TelemetrySpan;
    startActiveSpan?<T>(name: string, callback: (span: TelemetrySpan) => T): T;
}
export interface OpenTelemetryOptions {
    meter?: TelemetryMeter;
    tracer?: TelemetryTracer;
}
export declare class OpenTelemetry {
    private readonly options;
    private readonly counter?;
    private readonly duration?;
    private readonly operationsDuration?;
    private readonly handshakes;
    private readonly disposers;
    private closed;
    constructor(manager: Manager, options: OpenTelemetryOptions);
    private finishHandshake;
    private safe;
    private gauge;
    private backend;
    private event;
    private run;
    search(operation: () => Promise<SearchResult>): Promise<SearchResult>;
    operation<T>(name: TelemetryOperation, operation: () => Promise<T>, classify?: (result: T) => TelemetryOutcome): Promise<T>;
    syncOperation<T>(name: TelemetryOperation, operation: () => T, classify?: (result: T) => TelemetryOutcome): T;
    close(): void;
}
export {};
