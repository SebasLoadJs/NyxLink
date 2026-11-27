import { ProtocolResponseError } from './ProtocolValidation';
import { diagnosticsTimeout } from './NodeLinkDiagnostics';

export interface NodeLinkAdminOptions {
    allowSensitive: true;
    allowLoopbackHttp?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
}

export interface NodeLinkYoutubeConfig {
    refreshToken: string | null;
    visitorData: string | null;
    isConfigured: boolean;
    isValid: boolean | null;
}

export interface NodeLinkYoutubeConfigUpdate {
    refreshToken?: string;
    visitorData?: string;
}

export interface NodeLinkYoutubeConfigAcknowledgement {
    workersUpdated: number;
    fieldsUpdated: Array<'refreshToken' | 'visitorData'>;
}

export type NodeLinkWorkerTarget = {
    clusterId: number;
    id?: never;
    pid?: never;
} | {
    id: number;
    clusterId?: never;
    pid?: never;
} | {
    pid: number;
    id?: never;
    clusterId?: never;
};

export interface NodeLinkWorkerTerminationOptions extends NodeLinkAdminOptions {
    confirm: true;
    code: string;
}

export interface NodeLinkWorkerTermination {
    killed: true;
    id: number;
    clusterId: number;
    pid: number | null;
}

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const credential = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 16384 && !/[\x00-\x20\x7f]/.test(v);
function invalid(field: string): never { throw new ProtocolResponseError('NodeLink administration', field); }
export function assertNodeLinkAdmin(origin: string, options: NodeLinkAdminOptions): void {
    if (!options || options.allowSensitive !== true) throw new TypeError('NodeLink administration requires explicit sensitive access');
    const url = new URL(origin);
    if (url.protocol !== 'https:' && !(options.allowLoopbackHttp === true && ['127.0.0.1','[::1]'].includes(url.hostname))) throw new TypeError('NodeLink administration requires HTTPS or explicitly enabled loopback HTTP');
    diagnosticsTimeout(options.timeoutMs);
    options.signal?.throwIfAborted();
}
export function readNodeLinkYoutubeConfig(value: unknown): NodeLinkYoutubeConfig {
    if (!record(value) || !(value.refreshToken === null || credential(value.refreshToken)) ||
        !(value.visitorData === null || credential(value.visitorData)) ||
        typeof value.isConfigured !== 'boolean' || !(value.isValid === null || typeof value.isValid === 'boolean')) invalid('YouTube configuration');
    return { refreshToken: value.refreshToken, visitorData: value.visitorData, isConfigured: value.isConfigured, isValid: value.isValid };
}
export function nodeLinkYoutubeConfigBody(value: NodeLinkYoutubeConfigUpdate): NodeLinkYoutubeConfigUpdate {
    if (!record(value) || Object.keys(value).some(k => !['refreshToken','visitorData'].includes(k))) throw new TypeError('Invalid NodeLink YouTube configuration');
    const body: NodeLinkYoutubeConfigUpdate = {};
    for (const field of ['refreshToken','visitorData'] as const) {
        if (value[field] !== undefined) {
            if (!credential(value[field])) throw new TypeError('Invalid NodeLink YouTube configuration field');
            body[field] = value[field];
        }
    }
    if (!Object.keys(body).length) throw new TypeError('At least one YouTube configuration field is required');
    return body;
}
export function readNodeLinkYoutubeConfigAcknowledgement(value: unknown, body: NodeLinkYoutubeConfigUpdate): NodeLinkYoutubeConfigAcknowledgement {
    if (!record(value) || !integer(value.workersUpdated) || !Array.isArray(value.fieldsUpdated)) invalid('YouTube configuration acknowledgement');
    const expected = Object.keys(body);
    if (value.fieldsUpdated.length !== expected.length || new Set(value.fieldsUpdated).size !== expected.length ||
        !value.fieldsUpdated.every(field => expected.includes(field))) invalid('YouTube updated fields');
    return { workersUpdated: value.workersUpdated, fieldsUpdated: [...value.fieldsUpdated] as NodeLinkYoutubeConfigAcknowledgement['fieldsUpdated'] };
}
export function nodeLinkWorkerTerminationBody(target: NodeLinkWorkerTarget, options: NodeLinkWorkerTerminationOptions): Record<string, string | number> {
    if (!options || options.confirm !== true || !credential(options.code) || options.code.length > 512) throw new TypeError('Worker termination requires explicit confirmation and code');
    if (!record(target) || Object.keys(target).length !== 1) throw new TypeError('Specify exactly one worker identifier');
    const key = Object.keys(target)[0];
    const id = (target as Record<string, unknown>)[key];
    if (!['clusterId','id','pid'].includes(key) || !integer(id) || (key !== 'id' && id === 0)) throw new TypeError('Invalid worker identifier');
    return { [key]: id, code: options.code };
}
export function readNodeLinkWorkerTermination(value: unknown, target: NodeLinkWorkerTarget): NodeLinkWorkerTermination {
    if (!record(value) || value.killed !== true || !integer(value.id) || !integer(value.clusterId) ||
        !(value.pid === null || integer(value.pid))) invalid('worker termination acknowledgement');
    const key = Object.keys(target)[0] as 'id' | 'clusterId' | 'pid';
    if (value[key] !== target[key]) invalid('worker termination identity');
    return { killed: true, id: value.id, clusterId: value.clusterId, pid: value.pid };
}
