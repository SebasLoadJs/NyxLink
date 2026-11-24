"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireGroupId = requireGroupId;
exports.requireGuildId = requireGuildId;
exports.groupCreateBody = groupCreateBody;
exports.groupPatchBody = groupPatchBody;
exports.validateGroup = validateGroup;
exports.validateGroups = validateGroups;
exports.validateGroupPatch = validateGroupPatch;
exports.sponsorOptionsBody = sponsorOptionsBody;
exports.sponsorSegmentsBody = sponsorSegmentsBody;
exports.validateSponsorState = validateSponsorState;
const ProtocolValidation_1 = require("./ProtocolValidation");
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const numeric = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const text = (v) => typeof v === 'string' && v.length > 0;
const guild = (v) => typeof v === 'string' && /^\d{17,20}$/.test(v);
const guilds = (v) => Array.isArray(v) && Array.from(v).every(guild);
const strings = (v) => Array.isArray(v) && Array.from(v).every(text);
const optional = (v, check) => v === undefined || check(v);
const validId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
function requireGroupId(id) {
    if (!validId(id))
        throw new TypeError('Group ID must contain 1–128 ASCII letters, digits, hyphens or underscores');
}
function requireGuildId(id) {
    if (!guild(id))
        throw new TypeError('Invalid guild ID');
}
function groupCreateBody(value) {
    if (!object(value) || !validId(value.id) || !optional(value.guildIds, guilds))
        throw new TypeError('Invalid group creation');
    return { id: value.id, ...(value.guildIds ? { guildIds: [...new Set(value.guildIds)] } : {}) };
}
function groupPatchBody(value) {
    if (!object(value))
        throw new TypeError('Invalid group update');
    const keys = ['players', 'track', 'position', 'endTime', 'volume', 'paused', 'filters', 'fading', 'loudnessNormalizer', 'ducking'];
    if (Object.keys(value).some(key => !keys.includes(key)))
        throw new TypeError('Unsupported group update field');
    const membership = value.players;
    if (membership !== undefined) {
        if (!object(membership))
            throw new TypeError('Invalid group membership');
        const { add, remove } = membership;
        if (add !== undefined && !guilds(add) || remove !== undefined && !guilds(remove))
            throw new TypeError('Invalid group membership');
        if (add && remove && add.some(id => remove.includes(id)))
            throw new TypeError('Conflicting group membership');
    }
    const track = value.track;
    if (track !== undefined && track !== null && (!object(track) ||
        !(text(track.encoded) || track.encoded === null || text(track.identifier)) ||
        !optional(track.userData, object)))
        throw new TypeError('Invalid group track');
    if (!optional(value.position, numeric) || !optional(value.endTime, v => v === null || numeric(v)) ||
        !optional(value.volume, v => numeric(v) && v <= 1000) || !optional(value.filters, object) || !optional(value.fading, object) ||
        !['paused', 'loudnessNormalizer', 'ducking'].every(key => optional(value[key], v => typeof v === 'boolean')))
        throw new TypeError('Invalid group playback control');
    return structuredClone(value);
}
function validateGroup(value, expected) {
    if (!object(value) || !text(value.id) || expected !== undefined && value.id !== expected ||
        !guilds(value.guildIds) || new Set(value.guildIds).size !== value.guildIds.length || !numeric(value.createdAt))
        throw new ProtocolValidation_1.ProtocolResponseError('player group', 'identity or membership');
}
function validateGroups(value) {
    if (!Array.isArray(value))
        throw new ProtocolValidation_1.ProtocolResponseError('player groups', 'array');
    for (const group of value)
        validateGroup(group);
}
function validateGroupPatch(value, id) {
    validateGroup(value, id);
    const data = value;
    if (!Array.isArray(data.players))
        throw new ProtocolValidation_1.ProtocolResponseError('group update', 'players');
    const seen = new Set();
    for (const player of data.players) {
        (0, ProtocolValidation_1.validatePlayerRead)(player);
        if (!value.guildIds.includes(player.guildId) || seen.has(player.guildId))
            throw new ProtocolValidation_1.ProtocolResponseError('group update', 'player membership');
        seen.add(player.guildId);
    }
    if (data.errors !== undefined) {
        if (!Array.isArray(data.errors))
            throw new ProtocolValidation_1.ProtocolResponseError('group update', 'errors');
        for (const error of data.errors) {
            if (!object(error) || !guild(error.guildId) || !value.guildIds.includes(error.guildId) ||
                typeof error.error !== 'string' || seen.has(error.guildId))
                throw new ProtocolValidation_1.ProtocolResponseError('group update', 'error membership');
            seen.add(error.guildId);
        }
    }
}
function validSponsorOptions(value) {
    return object(value) && optional(value.enabled, v => typeof v === 'boolean') &&
        optional(value.categories, strings) && optional(value.actionTypes, strings) && optional(value.skipMarginMs, numeric);
}
function sponsorOptionsBody(value) {
    if (!validSponsorOptions(value))
        throw new TypeError('Invalid SponsorBlock options');
    const { enabled, categories, actionTypes, skipMarginMs } = value;
    return structuredClone({ enabled, categories, actionTypes, skipMarginMs });
}
function validSegment(v) {
    return object(v) && text(v.uuid) && numeric(v.start) && numeric(v.end) && v.end >= v.start &&
        text(v.category) && text(v.actionType) && typeof v.votes === 'number' && Number.isFinite(v.votes) &&
        typeof v.locked === 'boolean' && numeric(v.videoDuration) && typeof v.description === 'string';
}
function sponsorSegmentsBody(segments) {
    if (!Array.isArray(segments) || !Array.from(segments).every(validSegment))
        throw new TypeError('Invalid SponsorBlock segments');
    return { segments: structuredClone(segments) };
}
function validateSponsorState(value) {
    if (!object(value) || !validSponsorOptions(value) || typeof value.enabled !== 'boolean' ||
        !strings(value.categories) || !strings(value.actionTypes) || !numeric(value.skipMarginMs) ||
        !Array.isArray(value.segments) || !value.segments.every(validSegment) ||
        !(value.lastSkippedUuid === null || typeof value.lastSkippedUuid === 'string'))
        throw new ProtocolValidation_1.ProtocolResponseError('SponsorBlock', 'state');
}
//# sourceMappingURL=NodeLinkOrchestration.js.map