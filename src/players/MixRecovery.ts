import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';
import { Track } from '../entities/Track';
import { TrackResolver } from '../tracks/TrackResolver';
import { awaitWithAbort } from '../tracks/AbortableLookup';
import { validateMixLayers, validateMixCreated, type MixLayerState } from '../backends/NodeLinkMixContracts';
import { canSendNativeAudio } from './AdvancedAudioRecovery';

export interface MixRecoveryOptions {
    /** Explicit opt-in: layers restart from the beginning; the protocol has no seek operation. */
    mode: 'restart';
    maxLayers?: number;
}
export interface MixRecoveryReport {
    status: 'unavailable' | 'skipped' | 'completed' | 'partial';
    captured: number;
    restored: readonly { sourceId: string; targetId: string }[];
    failed: number;
    skipped: number;
}
export type MixCapture = { layers: MixLayerState[]; report: MixRecoveryReport; capturedAt: number };
const empty = (status: MixRecoveryReport['status']): MixRecoveryReport => ({
    status, captured: 0, restored: [], failed: 0, skipped: 0
});

/** Only authoritative, fresh source snapshots may be replayed. No cached layer resurrection. */
export async function captureMixRecovery(player: Player, source: Node, options: MixRecoveryOptions,
    active: () => boolean, signal: AbortSignal): Promise<MixCapture> {
    const unavailable = { layers: [], report: empty('unavailable'), capturedAt: 0 };
    if (!options || options.mode !== 'restart' || options.maxLayers !== undefined &&
        (!Number.isSafeInteger(options.maxLayers) || options.maxLayers < 1 || options.maxLayers > 5)) return unavailable;
    if (!source.connected || source.destroyed || !canSendNativeAudio(source, 'mix:list') || !active()) return unavailable;
    const session = source.sessionId, socket = source.socket, backend = source.backend;
    const limit = options.maxLayers ?? 5;
    try {
        const result = await awaitWithAbort(source.rest.getMixLayers(player.guildId), AbortSignal.any([signal, AbortSignal.timeout(10000)]));
        if (!active() || signal.aborted || source.destroyed || source.sessionId !== session ||
            source.socket !== socket || source.backend !== backend || result === null) return unavailable;
        validateMixLayers(result);
        return { layers: structuredClone(result.mixes.slice(0, limit)), capturedAt: Date.now(),
            report: { ...empty('skipped'), captured: result.mixes.length, skipped: result.mixes.length } };
    } catch { return unavailable; }
}

/** Recreate layers only after the main migration and source cleanup are acknowledged. */
export async function restoreMixRecovery(player: Player, source: Node, target: Node, capture: MixCapture,
    active: () => boolean, signal: AbortSignal): Promise<MixRecoveryReport> {
    if (capture.report.status === 'unavailable') return capture.report;
    if (!capture.report.captured) return { ...capture.report, status: 'completed' };
    if (!capture.layers.length || Date.now() - capture.capturedAt > 30000) return capture.report;
    const session = target.sessionId, socket = target.socket, backend = target.backend;
    const sameSession = () => !target.destroyed && target.connected && target.sessionId === session &&
        target.socket === socket && target.backend === backend && player.node === target;
    const ready = () => Date.now() - capture.capturedAt <= 30000 && active() && !signal.aborted && sameSession() && player.playing && !player.paused &&
        canSendNativeAudio(target, 'mix:add') && canSendNativeAudio(target, 'mix:remove');
    if (!ready()) return capture.report;
    const restored: { sourceId: string; targetId: string }[] = [];
    let failed = 0;
    for (const layer of capture.layers) {
        if (!ready()) break;
        try {
            const track = new Track(layer.track, undefined, undefined, []);
            track.backend = source.backend?.kind;
            // Don't restart expired finite layers or disabled sources.
            const info = track.getInfo();
            if (!info.isStream && info.length > 0 && layer.position + Math.max(0, Date.now() - capture.capturedAt) >= info.length ||
                target.manager.options.sources?.disabledSources?.some(name => name.toLowerCase() === info.sourceName.toLowerCase())) continue;
            const resolved = await TrackResolver.resolve(track, target, source, signal);
            if (!ready()) break;
            // Do not retry an ambiguous POST; it may already have created a layer.
            const result = await target.rest.addMixLayer(player.guildId, { track: { encoded: resolved.encoded }, volume: layer.volume });
            if (!result) { failed++; continue; }
            validateMixCreated(result);
            if (!ready()) {
                // Remove a late acknowledged creation only in its own session.
                if (sameSession()) {
                    try { await target.rest.removeMixLayer(player.guildId, result.id); } catch { /* result is reported as failed */ }
                }
                failed++;
                break;
            }
            restored.push({ sourceId: layer.id, targetId: result.id });
        } catch { failed++; }
    }
    const skipped = capture.report.captured - restored.length - failed;
    return { status: skipped || failed ? 'partial' : 'completed', captured: capture.report.captured, restored, failed, skipped };
}
