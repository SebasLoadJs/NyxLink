import type { IFilters, IFadingOptions } from '../typings/Interfaces';
import type { BackendKind } from './BackendAdapter';
import { type CrossfadeOptions } from './NodeLinkContracts';
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
    encodedTrack?: string | null;
    identifier?: string;
    position?: number;
    endTime?: number | null;
    volume?: number;
    paused?: boolean;
    filters?: IFilters;
    voice?: PlayerVoiceUpdate;
}
export interface NodeLinkPlayerUpdate extends CommonPlayerUpdate {
    track?: PlayerTrackUpdate & {
        audioTrackId?: string;
    };
    nextTrack?: {
        encoded: string;
        userData?: Record<string, unknown>;
    } | null;
    fading?: IFadingOptions;
    crossfade?: CrossfadeOptions;
    loudnessNormalizer?: boolean;
}
export type PlayerUpdatePayload = NodeLinkPlayerUpdate & Record<string, unknown>;
export type SessionUpdateResponse = {
    resuming: boolean;
    timeout: number;
};
export type PlayerUpdateAcknowledgement = Record<string, unknown> & {
    guildId?: string;
    volume?: number;
    paused?: boolean;
    state?: {
        position: number;
    } & Record<string, unknown>;
    track?: {
        encoded: string | null;
        userData?: Record<string, unknown>;
    } & Record<string, unknown> | null;
};
export declare function preparePlayerUpdate(backend: BackendKind | 'unknown', payload: PlayerUpdatePayload, channelId?: string, unavailable?: (feature: string) => boolean): PlayerUpdatePayload;
