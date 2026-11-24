import { formatBox, type FormatterOptions } from './LogFormatter';
import type { LogContext } from './StructuredLog';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value : '--';
const number = (value: unknown, unit = ''): string => typeof value === 'number' && Number.isFinite(value) ? `${value}${unit}` : '--';

/** Render only observed fields; malformed/truncated event context falls back to its message. */
export function formatDashboardObservation(context: LogContext, options: FormatterOptions): string | undefined {
    if (!Array.isArray(context.nodes) || !Array.isArray(context.sources) || !object(context.audio) || !object(context.runtime)) return;
    const rows: Record<string, unknown> = {
        Cluster: `${context.nodes.length} shown, ${number(context.truncatedNodes)} omitted`,
        Audio: `${number(context.audio.playing)} playing / ${number(context.audio.players)} players / ${number(context.audio.paused)} paused`,
        Queue: `${number(context.audio.queuedTracks)} waiting tracks`,
    };
    for (const [index, value] of context.nodes.entries()) {
        if (!object(value)) continue;
        rows[`Node ${index + 1}`] = `${text(value.id)} / ${text(value.backend)} / ${text(value.state)} / ${number(value.latencyMs, 'ms')} / ${number(value.players)} players`;
        if (value.cpuLoad !== undefined || value.memoryUsedBytes !== undefined) {
            rows[`Stats ${index + 1}`] = `CPU load ${number(value.cpuLoad)} / memory ${number(value.memoryUsedBytes, ' B')} / age ${number(value.statsAgeMs, 'ms')}`;
        }
    }
    for (const [index, value] of context.sources.entries()) {
        if (!object(value)) continue;
        rows[`Source ${index + 1}`] = `${text(value.nodeId)} / ${text(value.source)} / ${text(value.status)} / p95 ${number(value.p95Ms, 'ms')} / age ${number(value.ageMs, 'ms')}`;
    }
    if (!context.sources.length) rows.Sources = 'No current source-health observations';
    rows.Runtime = `heap ${number(context.runtime.heapUsedBytes, ' B')} / RSS ${number(context.runtime.rssBytes, ' B')}`;
    rows.EventLoop = `${number(context.runtime.eventLoopUtilization)} utilization / uptime ${number(context.runtime.uptimeSeconds, 's')}`;
    return formatBox('NYXLINK / OBSERVED CLUSTER', rows, options.width);
}

export function formatErrorDiagnostic(context: LogContext, options: FormatterOptions): string | undefined {
    const diagnostic = context.diagnostic;
    if (!object(diagnostic) || typeof diagnostic.code !== 'string' || typeof diagnostic.action !== 'string') return;
    const fields: Record<string, unknown> = { Code: diagnostic.code, Severity: 'ERROR', Cause: text(diagnostic.message), Action: diagnostic.action };
    for (const key of ['nodeId', 'guildId', 'traceId', 'operation']) if (context[key] !== undefined) fields[key] = context[key];
    return formatBox('NYXLINK / ERROR DIAGNOSTIC', fields, options.width);
}
