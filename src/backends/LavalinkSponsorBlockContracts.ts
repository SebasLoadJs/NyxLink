import { ProtocolResponseError } from './ProtocolValidation';

/** Official topi314 SponsorBlock plugin categories for Lavalink v4. */
export const lavalinkSponsorBlockCategories = [
    'sponsor', 'selfpromo', 'interaction', 'intro', 'outro',
    'preview', 'music_offtopic', 'filler'
] as const;
export type LavalinkSponsorBlockCategory = typeof lavalinkSponsorBlockCategories[number];

const allowed = new Set<string>(lavalinkSponsorBlockCategories);
function validList(value: unknown): value is LavalinkSponsorBlockCategory[] {
    return Array.isArray(value) && value.length <= lavalinkSponsorBlockCategories.length &&
        value.every(item => typeof item === 'string' && allowed.has(item)) &&
        new Set(value).size === value.length;
}

/** Only accept documented category strings. Detach input arrays before sending. */
export function sponsorBlockCategoryBody(value: LavalinkSponsorBlockCategory[]): LavalinkSponsorBlockCategory[] {
    if (!validList(value)) throw new TypeError('Invalid Lavalink SponsorBlock categories');
    return [...value];
}

/** Validate remote JSON before treating an endpoint as observed/available. */
export function validateSponsorBlockCategories(value: unknown): asserts value is LavalinkSponsorBlockCategory[] {
    if (!validList(value)) throw new ProtocolResponseError('Lavalink SponsorBlock', 'categories');
}

export function hasLavalinkSponsorBlockPlugin(plugins: readonly { name: string }[]): boolean {
    return plugins.some(plugin => ['sponsorblock', 'sponsorblock-plugin'].includes(plugin.name.toLowerCase()));
}

export function lavalinkSponsorBlockPath(sessionId: string, guildId: string): string {
    if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
        throw new TypeError('Invalid Lavalink session ID');
    }
    if (typeof guildId !== 'string' || !/^[0-9]{17,20}$/.test(guildId)) {
        throw new TypeError('Invalid guild ID');
    }
    return '/v4/sessions/' + encodeURIComponent(sessionId) +
        '/players/' + encodeURIComponent(guildId) + '/sponsorblock/categories';
}
