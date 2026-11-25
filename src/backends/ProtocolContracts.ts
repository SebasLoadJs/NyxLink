import type { IFilters, IFadingOptions } from '../typings/Interfaces';
import { FeatureUnavailableError } from '../errors/FeatureUnavailableError';
import type { BackendKind } from './BackendAdapter';
import { normalizeCrossfade, type CrossfadeOptions } from './NodeLinkContracts';

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
    crossfade?: CrossfadeOptions;
    loudnessNormalizer?: boolean;
}
/** The extensible boundary preserves plugin fields and legacy raw payload callers. */
export type PlayerUpdatePayload = NodeLinkPlayerUpdate & Record<string, unknown>;
export type SessionUpdateResponse = { resuming: boolean; timeout: number };
/** Player updates may return a complete player or a partial acknowledgment. */
export type PlayerUpdateAcknowledgement = Record<string, unknown> & {
    guildId?: string;
    volume?: number;
    paused?: boolean;
    state?: { position: number } & Record<string, unknown>;
    track?: { encoded: string | null; userData?: Record<string, unknown> } & Record<string, unknown> | null;
};

const extensionFields = ['fading', 'nextTrack', 'loudnessNormalizer', 'crossfade'] as const;
export const nodeLinkPlayerFeatures = Object.freeze([...extensionFields, 'audioTrackId'] as const);

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
    if (payload.crossfade !== undefined) result.crossfade = normalizeCrossfade(payload.crossfade);
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
