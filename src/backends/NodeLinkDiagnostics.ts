import { ProtocolResponseError } from './ProtocolValidation';

export type NodeLinkProfilerScope = 'all' | 'master' | 'workers' | 'sourceWorkers';
export interface NodeLinkProfilerOptions {
    code: string;
    scope?: NodeLinkProfilerScope;
    allowLoopbackHttp?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
}
export interface NodeLinkProcessMemory {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers?: number;
}
export interface NodeLinkProfilerProcess {
    success: boolean;
    pid?: number;
    clusterId?: number;
    uniqueId?: number;
    memory?: NodeLinkProcessMemory;
    cpuProfiling?: boolean;
    heapSamplingActive?: boolean;
    uptimeSec?: number;
}
export interface NodeLinkProfilerSnapshot {
    action: 'status';
    scope: NodeLinkProfilerScope;
    timestamp: number;
    master?: NodeLinkProfilerProcess;
    workers?: NodeLinkProfilerProcess[];
    sourceWorkers?: NodeLinkProfilerProcess[];
    workersUnavailable?: boolean;
    sourceWorkersUnavailable?: boolean;
}
export interface NodeLinkWorkerSnapshot {
    id: number;
    clusterId?: number;
    pid?: number;
    health?: boolean;
    uptime?: number;
    players?: number;
    playingPlayers?: number;
    commandQueueLength?: number;
    cpuLoad?: number;
    memoryUsed?: number;
    memoryAllocated?: number;
    eventLoopLag?: number;
    eventLoopLagP50?: number;
    eventLoopLagP95?: number;
    eventLoopLagP99?: number;
    stuckRecoveries?: number;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const integer = (v: unknown): v is number => nonnegative(v) && Number.isSafeInteger(v);
const scopes: readonly NodeLinkProfilerScope[] = ['all','master','workers','sourceWorkers'];
function invalid(field: string): never { throw new ProtocolResponseError('NodeLink diagnostics', field); }
export function profilerQuery(origin: string, options: NodeLinkProfilerOptions): URLSearchParams {
    if (!options || typeof options.code !== 'string' || options.code.length < 1 || options.code.length > 512 || /[^\x21-\x7e]/.test(options.code)) throw new TypeError('Invalid profiler access code');
    const url = new URL(origin);
    if (url.protocol !== 'https:' && !(options.allowLoopbackHttp === true && ['127.0.0.1','[::1]'].includes(url.hostname))) throw new TypeError('Profiler requires HTTPS or explicitly enabled loopback HTTP');
    const scope = options.scope ?? 'all';
    if (!scopes.includes(scope)) throw new TypeError('Invalid profiler scope');
    diagnosticsTimeout(options.timeoutMs);
    options.signal?.throwIfAborted();
    return new URLSearchParams({ action: 'status', scope });
}
export function diagnosticsTimeout(value?: number): number {
    const timeout = value ?? 15000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000) throw new RangeError('Invalid diagnostics timeout');
    return timeout;
}
function memory(value: unknown): NodeLinkProcessMemory {
    if (!record(value) || !integer(value.rss) || !integer(value.heapTotal) || !integer(value.heapUsed) || !integer(value.external) ||
        (value.arrayBuffers !== undefined && !integer(value.arrayBuffers))) invalid('memory');
    return { rss: value.rss, heapTotal: value.heapTotal, heapUsed: value.heapUsed, external: value.external,
        ...(value.arrayBuffers !== undefined ? { arrayBuffers: value.arrayBuffers } : {}) };
}
function processSnapshot(value: unknown, wrapped: boolean): NodeLinkProfilerProcess {
    if (!record(value)) invalid('process');
    const response = wrapped ? value.response : value;
    if (response !== undefined && !record(response)) invalid('process response');
    if (response !== undefined && typeof response.success !== 'boolean') invalid('process success');
    if (response === undefined && typeof value.error !== 'string') invalid('process error');
    const result: NodeLinkProfilerProcess = { success: response?.success === true };
    for (const name of ['pid','clusterId','uniqueId'] as const) {
        const field = value[name] ?? response?.[name];
        if (field !== undefined && field !== null) {
            // Upstream uses -1 for an unresolved worker; omit that sentinel.
            if (field === -1 && wrapped) continue;
            if (!integer(field)) invalid(name);
            result[name] = field;
        }
    }
    if (response?.memory !== undefined) result.memory = memory(response.memory);
    for (const name of ['cpuProfiling','heapSamplingActive'] as const) {
        const field = response?.[name];
        if (field !== undefined) {
            if (typeof field !== 'boolean') invalid(name);
            result[name] = field;
        }
    }
    if (response?.uptimeSec !== undefined) {
        if (!nonnegative(response.uptimeSec)) invalid('uptime');
        result.uptimeSec = response.uptimeSec;
    }
    return result;
}
/** Only a detached operational projection: never return traces, file paths, URLs or raw error messages. */
export function readNodeLinkProfilerSnapshot(value: unknown, scope: NodeLinkProfilerScope): NodeLinkProfilerSnapshot {
    if (!record(value) || value.action !== 'status' || value.scope !== scope || !scopes.includes(scope) || !integer(value.timestamp)) invalid('profiler envelope');
    const result: NodeLinkProfilerSnapshot = { action: 'status', scope, timestamp: value.timestamp };
    if (scope === 'all' || scope === 'master') result.master = processSnapshot(value.master, false);
    for (const field of ['workers','sourceWorkers'] as const) {
        if (scope !== 'all' && scope !== field) continue;
        const list = value[field];
        if (!Array.isArray(list) || list.length > 4096) invalid(field);
        result[field] = list.map(item => processSnapshot(item, true));
        const error = value[field + 'Error'];
        if (error !== undefined && typeof error !== 'string') invalid(field + 'Error');
        if (typeof error === 'string') result[field === 'workers' ? 'workersUnavailable' : 'sourceWorkersUnavailable'] = true;
    }
    return result;
}
/** Read the native worker stats array without leaking unknown provider or runtime fields. */
export function readNodeLinkWorkerSnapshots(value: unknown): NodeLinkWorkerSnapshot[] {
    if (!Array.isArray(value) || value.length > 4096) invalid('workers');
    const seen = new Set<number>();
    return value.map(row => {
        if (!record(row) || !integer(row.id) || seen.has(row.id) || !record(row.stats)) invalid('worker');
        seen.add(row.id);
        const result: NodeLinkWorkerSnapshot = { id: row.id };
        for (const field of ['clusterId','pid'] as const) if (row[field] !== undefined) {
            if (!integer(row[field])) invalid(field);
            result[field] = row[field];
        }
        if (row.health !== undefined) {
            if (typeof row.health !== 'boolean') invalid('health');
            result.health = row.health;
        }
        if (row.uptime !== undefined) {
            if (!nonnegative(row.uptime)) invalid('uptime');
            result.uptime = row.uptime;
        }
        for (const field of ['players','playingPlayers','commandQueueLength','stuckRecoveries'] as const) if (row.stats[field] !== undefined) {
            if (!integer(row.stats[field])) invalid(field);
            result[field] = row.stats[field];
        }
        for (const field of ['eventLoopLag','eventLoopLagP50','eventLoopLagP95','eventLoopLagP99'] as const) if (row.stats[field] !== undefined) {
            if (!nonnegative(row.stats[field])) invalid(field);
            result[field] = row.stats[field];
        }
        for (const [field, key, output] of [['cpu','nodelinkLoad','cpuLoad'],['memory','used','memoryUsed'],['memory','allocated','memoryAllocated']] as const) {
            const parent = row.stats[field];
            if (parent === undefined) continue;
            if (!record(parent)) invalid(field);
            const number = parent[key];
            if (number !== undefined) {
                if (!nonnegative(number)) invalid(key);
                result[output] = number;
            }
        }
        return result;
    });
}
