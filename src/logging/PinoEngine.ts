import type { AuroraLevel } from './AuroraEvents';
export type PinoOutputMeta = { level: number; time: number; msg?: string };
export interface PinoRecordEngine<T extends object> {
    write(level: AuroraLevel, record: T, message: string): void;
    close(): void;
}
/** Native Pino serialization shared by explicit logging and canonical Aurora.
 * No Pino module, worker or destination is created by importing NyxLink.
 */
export function createPinoRecordEngine<T extends object>(
    level: AuroraLevel, consume: (record: T, meta: PinoOutputMeta) => void,
    onError?: () => void,
): PinoRecordEngine<T> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pino = require('pino') as typeof import('pino').default;
    let closed = false;
    const logger = pino({
        level, base: null,
        redact: { paths: [
            'record.password','record.token','record.authorization',
            'record.sanitizedContext.password','record.sanitizedContext.token','record.sanitizedContext.authorization',
            'record.context.password','record.context.token','record.context.authorization',
        ], censor: '[REDACTED]' },
    }, {
        write(line: string) {
            if (closed) return;
            try {
                const raw = JSON.parse(line) as PinoOutputMeta & { record: T };
                consume(raw.record, { level: raw.level, time: raw.time, msg: raw.msg });
            } catch { try { onError?.(); } catch {} }
        },
    });
    return {
        write(severity, record, message) {
            if (!closed) logger[severity]({ record }, message);
        },
        close() { closed = true; },
    };
}
