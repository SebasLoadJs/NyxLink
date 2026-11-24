import type { IRESTGetPlayers, IFilters, IFadingOptions } from '../typings/Interfaces';
import type { PlayerTrackUpdate } from './ProtocolContracts';
export interface PlayerGroup {
    id: string;
    guildIds: string[];
    createdAt: number;
}
export interface GroupCreate {
    id: string;
    guildIds?: string[];
}
export interface GroupPatch {
    players?: {
        add?: string[];
        remove?: string[];
    };
    track?: (PlayerTrackUpdate & {
        language?: string;
        audioTrackId?: string;
    }) | null;
    position?: number;
    endTime?: number | null;
    volume?: number;
    paused?: boolean;
    filters?: IFilters;
    fading?: IFadingOptions;
    loudnessNormalizer?: boolean;
    ducking?: boolean;
}
export interface GroupPatchResult extends PlayerGroup {
    players: IRESTGetPlayers[];
    errors?: Array<{
        guildId: string;
        error: string;
    }>;
}
export interface SponsorBlockOptions {
    enabled?: boolean;
    categories?: string[];
    actionTypes?: string[];
    skipMarginMs?: number;
}
export interface SponsorBlockSegment {
    uuid: string;
    start: number;
    end: number;
    category: string;
    actionType: string;
    votes: number;
    locked: boolean;
    videoDuration: number;
    description: string;
}
export interface SponsorBlockState extends Required<SponsorBlockOptions> {
    segments: SponsorBlockSegment[];
    lastSkippedUuid: string | null;
}
export declare function requireGroupId(id: unknown): asserts id is string;
export declare function requireGuildId(id: unknown): asserts id is string;
export declare function groupCreateBody(value: GroupCreate): GroupCreate;
export declare function groupPatchBody(value: GroupPatch): GroupPatch;
export declare function validateGroup(value: unknown, expected?: string): asserts value is PlayerGroup;
export declare function validateGroups(value: unknown): asserts value is PlayerGroup[];
export declare function validateGroupPatch(value: unknown, id: string): asserts value is GroupPatchResult;
export declare function sponsorOptionsBody(value: SponsorBlockOptions): SponsorBlockOptions;
export declare function sponsorSegmentsBody(segments: SponsorBlockSegment[]): {
    segments: SponsorBlockSegment[];
};
export declare function validateSponsorState(value: unknown): asserts value is SponsorBlockState;
