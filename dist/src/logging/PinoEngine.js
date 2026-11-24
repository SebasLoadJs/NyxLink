"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPinoRecordEngine = createPinoRecordEngine;
function createPinoRecordEngine(level, consume, onError) {
    const pino = require('pino');
    let closed = false;
    const logger = pino({
        level, base: null,
        redact: { paths: [
                'record.password', 'record.token', 'record.authorization',
                'record.sanitizedContext.password', 'record.sanitizedContext.token', 'record.sanitizedContext.authorization',
                'record.context.password', 'record.context.token', 'record.context.authorization',
            ], censor: '[REDACTED]' },
    }, {
        write(line) {
            if (closed)
                return;
            try {
                const raw = JSON.parse(line);
                consume(raw.record, { level: raw.level, time: raw.time, msg: raw.msg, traceId: raw.trace_id, spanId: raw.span_id });
            }
            catch {
                try {
                    onError?.();
                }
                catch { }
            }
        },
    });
    return {
        write(severity, record, message) {
            if (!closed)
                logger[severity]({ record }, message);
        },
        close() { closed = true; },
    };
}
//# sourceMappingURL=PinoEngine.js.map