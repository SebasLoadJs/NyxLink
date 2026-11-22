import type { IFilters, IFadingOptions } from '../typings/Interfaces';
import { FeatureUnavailableError } from '../errors/FeatureUnavailableError';
import type { BackendKind } from './BackendAdapter';

export interface PlayerTrackUpdate {
    encoded?: string | null;
    identifier?: string;
    userData?: Record<string, unknown>;
}
export interface PlayerVoiceUpdate {
    sessionId: string;
    token: string;
    endpoint: string;
    channelId?: string;
}
export interface CommonPlayerUpdate {
    track?: PlayerTrackUpdate;
    /** Deprecated v4 field; prefer track.encoded. */
    encodedTrack?: string | null;
    /** Deprecated v4 field; prefer track.identifier. */
    identifier?: string;
    position?: number;
    endTime?: number | null;
    volume?: number;
    paused?: boolean;
    filters?: IFilters;
    voice?: PlayerVoiceUpdate;
}
export interface NodeLinkPlayerUpdate extends CommonPlayerUpdate {
    track?: PlayerTrackUpdate & { audioTrackId?: string };
    nextTrack?: { encoded: string; userData?: Record<string, unknown> } | null;
    fading?: IFadingOptions;
    loudnessNormalizer?: boolean;
}
/** The extensible boundary preserves plugin fields and legacy raw payload callers. */
export type PlayerUpdatePayload = NodeLinkPlayerUpdate & Record<string, unknown>;
export type SessionUpdateResponse = { resuming: boolean; timeout: number };

const extensionFields = ['fading', 'nextTrack', 'loudnessNormalizer'] as const;

/** Both adapters use the same wire protocol, with explicit backend-only fields. */
export function preparePlayerUpdate(
    backend: BackendKind | 'unknown',
    payload: PlayerUpdatePayload,
    channelId?: string,
    unavailable?: (feature: string) => boolean,
): PlayerUpdatePayload {
    const extensions: string[] = extensionFields.filter(field => payload[field] !== undefined);
    if (payload.track?.audioTrackId !== undefined) extensions.push('audioTrackId');
    for (const feature of extensions) {
        if (backend !== 'nodelink' || unavailable?.(feature)) throw new FeatureUnavailableError(feature, backend);
    }
    const result = { ...payload };
    if (payload.voice) {
        const voice = { ...payload.voice };
        if (backend === 'nodelink' && (!voice.sessionId || !voice.token || !voice.endpoint)) {
            throw new Error('voice payload requires sessionId, token, and endpoint.');
        }
        if (!voice.channelId && channelId) voice.channelId = channelId;
        result.voice = voice;
    }
    return result;
}
