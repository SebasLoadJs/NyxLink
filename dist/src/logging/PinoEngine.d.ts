import type { AuroraLevel } from './AuroraEvents';
export type PinoOutputMeta = {
    level: number;
    time: number;
    msg?: string;
    traceId?: string;
    spanId?: string;
};
export interface PinoRecordEngine<T extends object> {
    write(level: AuroraLevel, record: T, message: string): void;
    close(): void;
}
export declare function createPinoRecordEngine<T extends object>(level: AuroraLevel, consume: (record: T, meta: PinoOutputMeta) => void, onError?: () => void): PinoRecordEngine<T>;
