import type { AuroraEvent, AuroraLevel, AuroraPinoTarget, AuroraIncidentEngine, Manager, TerminalCoordinator, TerminalOptions, MusicSnapshot } from 'nyxlink';
export interface AuroraPipelineOptions extends Pick<TerminalOptions, 'stream'|'maxQueued'|'onRejected'|'onCriticalRejected'> {
    format?: 'silent'|'json'|'pretty'|'aurora'|'custom';
    level?: AuroraLevel|'silent';
    target?: AuroraPinoTarget;
    color?: boolean;
    unicode?: boolean;
    detail?: boolean;
    incidentCapacity?: number;
    onEvent?: (event: AuroraEvent)=>void;
    onRenderError?: ()=>void;
}
export interface AuroraPipeline {
    target: AuroraPinoTarget;
    level: AuroraLevel|'silent';
    terminal?: TerminalCoordinator;
    incidents?: AuroraIncidentEngine;
    banner(manager: Manager): void;
    startMusic?(strip: {snapshot(): MusicSnapshot}, options?: {signal?: AbortSignal; intervalMs?: number}): ()=>void;
    close(signal?: AbortSignal): Promise<boolean>;
}
export function createAuroraPipeline(options?: AuroraPipelineOptions): AuroraPipeline;
