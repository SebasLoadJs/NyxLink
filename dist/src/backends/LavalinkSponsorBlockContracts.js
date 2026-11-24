"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lavalinkSponsorBlockCategories = void 0;
exports.sponsorBlockCategoryBody = sponsorBlockCategoryBody;
exports.validateSponsorBlockCategories = validateSponsorBlockCategories;
exports.hasLavalinkSponsorBlockPlugin = hasLavalinkSponsorBlockPlugin;
exports.lavalinkSponsorBlockPath = lavalinkSponsorBlockPath;
const ProtocolValidation_1 = require("./ProtocolValidation");
exports.lavalinkSponsorBlockCategories = [
    'sponsor', 'selfpromo', 'interaction', 'intro', 'outro',
    'preview', 'music_offtopic', 'filler'
];
const allowed = new Set(exports.lavalinkSponsorBlockCategories);
function validList(value) {
    return Array.isArray(value) && value.length <= exports.lavalinkSponsorBlockCategories.length &&
        value.every(item => typeof item === 'string' && allowed.has(item)) &&
        new Set(value).size === value.length;
}
function sponsorBlockCategoryBody(value) {
    if (!validList(value))
        throw new TypeError('Invalid Lavalink SponsorBlock categories');
    return [...value];
}
function validateSponsorBlockCategories(value) {
    if (!validList(value))
        throw new ProtocolValidation_1.ProtocolResponseError('Lavalink SponsorBlock', 'categories');
}
function hasLavalinkSponsorBlockPlugin(plugins) {
    return plugins.some(plugin => ['sponsorblock', 'sponsorblock-plugin'].includes(plugin.name.toLowerCase()));
}
function lavalinkSponsorBlockPath(sessionId, guildId) {
    if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
        throw new TypeError('Invalid Lavalink session ID');
    }
    if (typeof guildId !== 'string' || !/^[0-9]{17,20}$/.test(guildId)) {
        throw new TypeError('Invalid guild ID');
    }
    return '/v4/sessions/' + encodeURIComponent(sessionId) +
        '/players/' + encodeURIComponent(guildId) + '/sponsorblock/categories';
}
//# sourceMappingURL=LavalinkSponsorBlockContracts.js.map