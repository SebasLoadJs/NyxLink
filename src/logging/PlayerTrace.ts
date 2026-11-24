import { formatBox, type FormatterOptions } from './LogFormatter';
import type { StructuredLogRecord } from './StructuredLog';

export interface PlayerTraceOptions { traceId?: string; limit?: number }

/** Compact observed timeline. It never infers unrecorded playback stages. */
export function formatPlayerTrace(guildId: string, records: readonly StructuredLogRecord[], options: FormatterOptions = {}): string {
    const fields: Record<string, unknown> = { Guild: guildId, Events: records.length };
    if (!records.length) fields.Observation = 'No retained events for this filter';
    for (const record of records.slice(-20)) {
        const status = typeof record.context.status === 'string' ? ` ${record.context.status}` : '';
        const duration = typeof record.context.durationMs === 'number' ? ` ${record.context.durationMs.toFixed(1)}ms` : '';
        const node = typeof record.context.nodeId === 'string' ? ` @${record.context.nodeId}` : '';
        const time = record.timestamp.slice(11, 23);
        const line = `${time} ${record.component} ${record.event}${status}${duration}${node}`;
        fields[`#${record.sequence}`] = [...line].length > 80 ? [...line].slice(0, 77).join('') + '...' : line;
    }
    return formatBox('NYXLINK / PLAYER TRACE', fields, options.width);
}
