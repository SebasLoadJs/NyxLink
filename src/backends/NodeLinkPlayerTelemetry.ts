/** Read-only experimental snapshots based on NodeLink PRs #267–269.
 * The server's processed-output clock is not the listener's media clock.
 */
export interface NodeLinkVisualizationSnapshot {
    capturedAt: number;
    outputFrame: number;
    sampleRate: number;
    rms: [number, number];
    peak: [number, number];
    waveform: number[];
    spectrum: Array<{
        hz: number;
        magnitude: number;
    }>;
}
export interface NodeLinkMusicAnalysisSnapshot {
    scope: 'processed-output';
    capturedAt: number;
    outputWindowStartMs: number;
    outputWindowEndMs: number;
    analyzedMs: number;
    bpm: number | null;
    bpmConfidence: number;
    key: string | null;
    keyConfidence: number;
    energy: number;
    estimatedLoudnessLufs: number;
    peak: number;
    bands: {
        low: number;
        mid: number;
        high: number;
    };
    vocalActivityEstimate: number;
    brightness: number;
    beatPositionsMs: number[];
    onsetPositionsMs: number[];
    silenceRatio: number;
}
export interface NodeLinkAudioProcessingSnapshot {
    requested_gain: number;
    applied_gain: number;
    average_applied_gain: number;
    max_gain_reduction_db: number;
    average_gain_reduction_db: number;
    average_gain_reduction_active_db: number;
    limiter_active_duration_ms: number;
}
export interface NodeLinkPlayerTelemetry {
    visualization?: NodeLinkVisualizationSnapshot;
    musicAnalysis?: NodeLinkMusicAnalysisSnapshot;
    audioProcessing?: NodeLinkAudioProcessingSnapshot;
}

const obj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => finite(v) && v >= 0;
const count = (v: unknown): v is number => positive(v) && Number.isSafeInteger(v);
const unit = (v: unknown): v is number => positive(v) && v <= 1;
function array(v: unknown, max: number, predicate: (n: unknown) => n is number): number[] | undefined {
    return Array.isArray(v) && v.length <= max && v.every(predicate) ? [...v] : undefined;
}
function pair(v: unknown): [number, number] | undefined {
    const a = array(v, 2, unit);
    return a?.length === 2 ? [a[0], a[1]] : undefined;
}
function visualization(v: unknown): NodeLinkVisualizationSnapshot | undefined {
    if (!obj(v) || !count(v.capturedAt) || !count(v.outputFrame) || !count(v.sampleRate) || v.sampleRate <= 0) return undefined;
    const rms = pair(v.rms), peak = pair(v.peak), waveform = array(v.waveform, 32, unit);
    if (!rms || !peak || waveform?.length !== 32 || !Array.isArray(v.spectrum) || v.spectrum.length !== 8) return undefined;
    const spectrum: NodeLinkVisualizationSnapshot['spectrum'] = [];
    const seen = new Set<number>();
    for (const row of v.spectrum) {
        if (!obj(row) || !positive(row.hz) || row.hz <= 0 || row.hz > v.sampleRate / 2 || seen.has(row.hz) || !positive(row.magnitude)) return undefined;
        seen.add(row.hz); spectrum.push({ hz: row.hz, magnitude: row.magnitude });
    }
    return { capturedAt: v.capturedAt, outputFrame: v.outputFrame, sampleRate: v.sampleRate, rms, peak, waveform, spectrum };
}
function analysis(v: unknown): NodeLinkMusicAnalysisSnapshot | undefined {
    if (!obj(v) || v.scope !== 'processed-output' || !count(v.capturedAt) || !positive(v.outputWindowStartMs) ||
        !positive(v.outputWindowEndMs) || !positive(v.analyzedMs) || v.analyzedMs > 12000 ||
        v.outputWindowEndMs < v.outputWindowStartMs ||
        v.outputWindowEndMs - v.outputWindowStartMs !== v.analyzedMs ||
        !(v.bpm === null || positive(v.bpm)) || !(v.key === null || typeof v.key === 'string' && v.key.length <= 64) ||
        !unit(v.bpmConfidence) || !unit(v.keyConfidence) || !positive(v.energy) ||
        !finite(v.estimatedLoudnessLufs) || !positive(v.peak) || !positive(v.vocalActivityEstimate) ||
        !positive(v.brightness) || !unit(v.silenceRatio) || !obj(v.bands) ||
        !positive(v.bands.low) || !positive(v.bands.mid) || !positive(v.bands.high)) return undefined;
    const beats = array(v.beatPositionsMs, 128, positive), onsets = array(v.onsetPositionsMs, 128, positive);
    const inside = (a: number[]) => a.every(n => n >= (v.outputWindowStartMs as number) && n <= (v.outputWindowEndMs as number));
    if (!beats || !onsets || !inside(beats) || !inside(onsets)) return undefined;
    return { scope: v.scope, capturedAt: v.capturedAt, outputWindowStartMs: v.outputWindowStartMs, outputWindowEndMs: v.outputWindowEndMs,
        analyzedMs: v.analyzedMs, bpm: v.bpm, bpmConfidence: v.bpmConfidence, key: v.key, keyConfidence: v.keyConfidence, energy: v.energy,
        estimatedLoudnessLufs: v.estimatedLoudnessLufs, peak: v.peak, bands: {low:v.bands.low,mid:v.bands.mid,high:v.bands.high},
        vocalActivityEstimate:v.vocalActivityEstimate, brightness:v.brightness, beatPositionsMs:beats,onsetPositionsMs:onsets,silenceRatio:v.silenceRatio };
}
function processing(v: unknown): NodeLinkAudioProcessingSnapshot | undefined {
    if (!obj(v) || !positive(v.requested_gain) || !positive(v.applied_gain) || !positive(v.average_applied_gain) ||
        !positive(v.max_gain_reduction_db) || !positive(v.average_gain_reduction_db) ||
        !positive(v.average_gain_reduction_active_db) || !positive(v.limiter_active_duration_ms)) return undefined;
    return { requested_gain:v.requested_gain, applied_gain:v.applied_gain, average_applied_gain:v.average_applied_gain,
        max_gain_reduction_db:v.max_gain_reduction_db, average_gain_reduction_db:v.average_gain_reduction_db,
        average_gain_reduction_active_db:v.average_gain_reduction_active_db, limiter_active_duration_ms:v.limiter_active_duration_ms };
}
/** Projects validated optional data from a player JSON response; no credentials, network or audio processing. */
export function readNodeLinkPlayerTelemetry(player: unknown): NodeLinkPlayerTelemetry | undefined {
    if (!obj(player)) return undefined;
    const result: NodeLinkPlayerTelemetry = {};
    const v = visualization(player.visualization), a = analysis(player.musicAnalysis), p = processing(player.audioProcessing);
    if (v) result.visualization = v;
    if (a) result.musicAnalysis = a;
    if (p) result.audioProcessing = p;
    return Object.keys(result).length ? result : undefined;
}
