import { ansi, formatBox, type FormatterOptions } from './LogFormatter';
import type { LogContext } from './StructuredLog';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value : '--';
const number = (value: unknown, unit = ''): string => typeof value === 'number' && Number.isFinite(value) ? `${value}${unit}` : '--';

/** Add terminal colors only after calculating the plain-text panel width.
 * JSON and NO_COLOR paths never receive these visual escape sequences. */
function themedBox(title: string, fields: Record<string, unknown>, options: FormatterOptions, color: number): string {
    const formatted = formatBox(title, fields, options.width);
    return options.color ? formatted.replace(title.toUpperCase(), ansi(title.toUpperCase(), color, true)) : formatted;
}

export function formatStartupObservation(context: LogContext, options: FormatterOptions, layout: string): string {
    const summary = `${number(context.readyNodes)}/${number(context.configuredNodes)} nodes ready`;
    if (layout === 'compact') {
        const label = options.color ? ansi('NYXLINK', 95, true) : 'NYXLINK';
        return `${label} ${text(context.packageVersion)} / ${text(context.runtime)} / ${summary}`;
    }
    const fields: Record<string, unknown> = { Runtime: text(context.runtime), Package: text(context.packageVersion),
        Core: context.initialized === true ? 'Initialized; node readiness reported separately' : 'Not initialized', Topology: summary };
    if (Array.isArray(context.nodes)) for (const [index, entry] of context.nodes.entries()) {
        if (!object(entry)) continue;
        fields[`Node ${index + 1}`] = `${text(entry.id)} / ${text(entry.backend)} / ${text(entry.state)}` +
            (layout === 'detailed' || layout === 'diagnostic' ? ` / ${number(entry.latencyMs, 'ms')} / ${number(entry.players)} players` : '');
    }
    if (typeof context.omittedNodes === 'number' && context.omittedNodes > 0) fields.Omitted = context.omittedNodes;
    if (layout === 'diagnostic') { fields.Platform = `${text(context.platform)} / ${text(context.architecture)}`; fields.Logging = context.logging; }
    return themedBox('NYXLINK / STARTUP', fields, options, 96);
}

/** Render only observed fields; malformed/truncated event context falls back to its message. */
export function formatDashboardObservation(context: LogContext, options: FormatterOptions, layout = 'standard'): string | undefined {
    if (!Array.isArray(context.nodes) || !Array.isArray(context.sources) || !object(context.audio) || !object(context.runtime)) return;
    if (layout === 'compact') {
        const summary = `NYXLINK / CLUSTER | ${context.nodes.length} nodes shown | ${number(context.audio.playing)}/${number(context.audio.players)} playing | queue ${number(context.audio.queuedTracks)}`;
        return options.color ? summary.replace('NYXLINK', ansi('NYXLINK', 95, true)) : summary;
    }
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
    if (object(context.performance)) {
        const observed = context.performance;
        if (object(observed.runtime)) rows.Delay = `event loop p95 ${number(observed.runtime.eventLoopP95Ms, 'ms')}`;
        if (object(observed.resources)) rows.Resources = `${number(observed.resources.pendingRequests)} pending HTTP / ${number(observed.resources.pendingPlayerCommands)} player commands / ${number(observed.resources.managerListeners)} listeners`;
        if (object(observed.durations) && object(observed.durations.rest)) rows.REST = `p50 ${number(observed.durations.rest.p50Ms, 'ms')} / p95 ${number(observed.durations.rest.p95Ms, 'ms')}`;
    }
    return themedBox('NYXLINK / OBSERVED CLUSTER', rows, options, 95);
}

export function formatErrorDiagnostic(context: LogContext, options: FormatterOptions): string | undefined {
    const diagnostic = context.diagnostic;
    if (!object(diagnostic) || typeof diagnostic.code !== 'string' || typeof diagnostic.action !== 'string') return;
    const fields: Record<string, unknown> = { Code: diagnostic.code, Severity: 'ERROR', Cause: text(diagnostic.message), Action: diagnostic.action };
    for (const key of ['nodeId', 'guildId', 'traceId', 'operation']) if (context[key] !== undefined) fields[key] = context[key];
    return themedBox('NYXLINK / ERROR DIAGNOSTIC', fields, options, 91);
}
