import type { Node } from '../entities/Node';
import type { IFilters, IFadingOptions } from '../typings/Interfaces';
import type { CrossfadeOptions } from '../backends/NodeLinkContracts';
import type { PlayerUpdatePayload } from '../backends/ProtocolContracts';

export const nativeFilterKeys = ['echo', 'chorus', 'compressor', 'highpass', 'phaser', 'spatial'] as const;
export interface AdvancedAudioIntent {
    fading?: IFadingOptions;
    crossfade?: CrossfadeOptions;
    loudnessNormalizer?: boolean;
    audioTrackId?: string;
    nextTrack?: { encoded: string; userData?: Record<string, unknown> } | null;
}

/** Unknown support on NodeLink retains the existing optimistic request policy. */
export function canSendNativeAudio(node: Pick<Node, 'isNodeLink' | 'backend'>, feature: string): boolean {
    return node.isNodeLink && (!node.backend || node.backend.kind === 'nodelink') && node.backend?.featureStatus?.(feature) !== 'unavailable';
}

/** Copy only compatible native controls; never mutate the remembered intent. */
export function projectAdvancedAudio(payload: PlayerUpdatePayload, node: Pick<Node, 'isNodeLink' | 'backend'>,
    intent: AdvancedAudioIntent, suspended?: string[]): void {
    for (const feature of ['fading', 'crossfade', 'loudnessNormalizer', 'nextTrack'] as const) {
        const value = intent[feature];
        if (value === undefined) continue;
        if (canSendNativeAudio(node, feature)) Object.assign(payload, { [feature]: structuredClone(value) });
        else if (value !== null) suspended?.push(feature);
    }
    if (intent.audioTrackId && payload.track) {
        if (canSendNativeAudio(node, 'audioTrackId')) payload.track = { ...payload.track, audioTrackId: intent.audioTrackId };
        else suspended?.push('audioTrackId');
    }
}

/** Remove incompatible native filter keys from a freshly constructed wire payload. */
export function suspendNativeFilters(payload: IFilters, node: Pick<Node, 'isNodeLink' | 'backend'>): string[] {
    const suspended: string[] = [];
    for (const key of nativeFilterKeys) {
        if (payload[key] === undefined || canSendNativeAudio(node, 'filter:' + key)) continue;
        delete payload[key];
        suspended.push('filter:' + key);
    }
    return suspended;
}
