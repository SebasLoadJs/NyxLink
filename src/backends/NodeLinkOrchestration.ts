import type { IRESTGetPlayers, IFilters, IFadingOptions } from '../typings/Interfaces';
import type { PlayerTrackUpdate } from './ProtocolContracts';
import { ProtocolResponseError, validatePlayerRead } from './ProtocolValidation';

export interface PlayerGroup { id: string; guildIds: string[]; createdAt: number }
export interface GroupCreate { id: string; guildIds?: string[] }
export interface GroupPatch {
    players?: { add?: string[]; remove?: string[] };
    track?: (PlayerTrackUpdate & { language?: string; audioTrackId?: string }) | null;
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
    errors?: Array<{ guildId: string; error: string }>;
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

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const numeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const guild = (v: unknown): v is string => typeof v === 'string' && /^\d{17,20}$/.test(v);
const guilds = (v: unknown): v is string[] => Array.isArray(v) && Array.from(v).every(guild);
const strings = (v: unknown): v is string[] => Array.isArray(v) && Array.from(v).every(text);
const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const validId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

export function requireGroupId(id: unknown): asserts id is string {
    if (!validId(id)) throw new TypeError('Group ID must contain 1–128 ASCII letters, digits, hyphens or underscores');
}
export function requireGuildId(id: unknown): asserts id is string {
    if (!guild(id)) throw new TypeError('Invalid guild ID');
}
export function groupCreateBody(value: GroupCreate): GroupCreate {
    if (!object(value) || !validId(value.id) || !optional(value.guildIds, guilds)) throw new TypeError('Invalid group creation');
    return { id: value.id, ...(value.guildIds ? { guildIds: [...new Set(value.guildIds)] } : {}) };
}
export function groupPatchBody(value: GroupPatch): GroupPatch {
    if (!object(value)) throw new TypeError('Invalid group update');
    const keys = ['players','track','position','endTime','volume','paused','filters','fading','loudnessNormalizer','ducking'];
    if (Object.keys(value).some(key => !keys.includes(key))) throw new TypeError('Unsupported group update field');
    const membership = value.players;
    if (membership !== undefined) {
        if (!object(membership)) throw new TypeError('Invalid group membership');
        const { add, remove } = membership;
        if (add !== undefined && !guilds(add) || remove !== undefined && !guilds(remove)) throw new TypeError('Invalid group membership');
        if (add && remove && add.some(id => remove.includes(id))) throw new TypeError('Conflicting group membership');
    }
    const track = value.track;
    if (track !== undefined && track !== null && (!object(track) ||
        !(text(track.encoded) || track.encoded === null || text(track.identifier)) ||
        !optional(track.userData, object))) throw new TypeError('Invalid group track');
    if (!optional(value.position,numeric) || !optional(value.endTime,v=>v===null||numeric(v)) ||
        !optional(value.volume,v=>numeric(v)&&v<=1000) || !optional(value.filters,object) || !optional(value.fading,object) ||
        !['paused','loudnessNormalizer','ducking'].every(key=>optional((value as Record<string,unknown>)[key],v=>typeof v==='boolean'))) throw new TypeError('Invalid group playback control');
    return structuredClone(value);
}

export function validateGroup(value: unknown, expected?: string): asserts value is PlayerGroup {
    if (!object(value) || !text(value.id) || expected !== undefined && value.id !== expected ||
        !guilds(value.guildIds) || new Set(value.guildIds).size !== value.guildIds.length || !numeric(value.createdAt)) throw new ProtocolResponseError('player group','identity or membership');
}
export function validateGroups(value: unknown): asserts value is PlayerGroup[] {
    if (!Array.isArray(value)) throw new ProtocolResponseError('player groups','array');
    for (const group of value) validateGroup(group);
}
export function validateGroupPatch(value: unknown, id: string): asserts value is GroupPatchResult {
    validateGroup(value,id);
    const data = value as PlayerGroup & Record<string,unknown>;
    if (!Array.isArray(data.players)) throw new ProtocolResponseError('group update','players');
    const seen = new Set<string>();
    for (const player of data.players) {
        validatePlayerRead(player);
        if (!value.guildIds.includes(player.guildId) || seen.has(player.guildId)) throw new ProtocolResponseError('group update','player membership');
        seen.add(player.guildId);
    }
    if (data.errors !== undefined) {
        if (!Array.isArray(data.errors)) throw new ProtocolResponseError('group update','errors');
        for (const error of data.errors) {
            if (!object(error) || !guild(error.guildId) || !value.guildIds.includes(error.guildId) ||
                typeof error.error !== 'string' || seen.has(error.guildId)) throw new ProtocolResponseError('group update','error membership');
            seen.add(error.guildId);
        }
    }
}
function validSponsorOptions(value: unknown): boolean {
    return object(value) && optional(value.enabled,v=>typeof v==='boolean') &&
        optional(value.categories,strings) && optional(value.actionTypes,strings) && optional(value.skipMarginMs,numeric);
}
export function sponsorOptionsBody(value: SponsorBlockOptions): SponsorBlockOptions {
    if (!validSponsorOptions(value)) throw new TypeError('Invalid SponsorBlock options');
    const { enabled,categories,actionTypes,skipMarginMs } = value;
    return structuredClone({ enabled,categories,actionTypes,skipMarginMs });
}
function validSegment(v: unknown): v is SponsorBlockSegment {
    return object(v) && text(v.uuid) && numeric(v.start) && numeric(v.end) && v.end >= v.start &&
        text(v.category) && text(v.actionType) && typeof v.votes==='number' && Number.isFinite(v.votes) &&
        typeof v.locked==='boolean' && numeric(v.videoDuration) && typeof v.description==='string';
}
export function sponsorSegmentsBody(segments: SponsorBlockSegment[]): { segments: SponsorBlockSegment[] } {
    if (!Array.isArray(segments) || !Array.from(segments).every(validSegment)) throw new TypeError('Invalid SponsorBlock segments');
    return { segments: structuredClone(segments) };
}
export function validateSponsorState(value: unknown): asserts value is SponsorBlockState {
    if (!object(value) || !validSponsorOptions(value) || typeof value.enabled!=='boolean' ||
        !strings(value.categories) || !strings(value.actionTypes) || !numeric(value.skipMarginMs) ||
        !Array.isArray(value.segments) || !value.segments.every(validSegment) ||
        !(value.lastSkippedUuid===null || typeof value.lastSkippedUuid==='string')) throw new ProtocolResponseError('SponsorBlock','state');
}
