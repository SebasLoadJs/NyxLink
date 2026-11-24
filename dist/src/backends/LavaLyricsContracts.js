"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLavaLyrics = validateLavaLyrics;
exports.lavaLyricsParameters = lavaLyricsParameters;
exports.hasLavaLyricsPlugin = hasLavaLyricsPlugin;
const ProtocolValidation_1 = require("./ProtocolValidation");
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function milliseconds(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function validateLavaLyrics(value) {
    if (!record(value) || typeof value.sourceName !== 'string' || !value.sourceName.trim() ||
        typeof value.provider !== 'string' || !value.provider.trim() ||
        !(value.text === null || typeof value.text === 'string') ||
        !Array.isArray(value.lines) || !record(value.plugin)) {
        throw new ProtocolValidation_1.ProtocolResponseError('LavaLyrics', 'lyrics envelope');
    }
    for (const line of value.lines) {
        if (!record(line) || !milliseconds(line.timestamp) ||
            !(line.duration === null || milliseconds(line.duration)) ||
            typeof line.line !== 'string' || !record(line.plugin)) {
            throw new ProtocolValidation_1.ProtocolResponseError('LavaLyrics', 'lyrics line');
        }
    }
}
function lavaLyricsParameters(encodedTrack, options) {
    if (typeof encodedTrack !== 'string' || !encodedTrack.trim() || encodedTrack.length > 65536) {
        throw new TypeError('LavaLyrics requires a nonempty encoded track');
    }
    if (options !== undefined && (!record(options) ||
        (options.skipTrackSource !== undefined && typeof options.skipTrackSource !== 'boolean'))) {
        throw new TypeError('Invalid LavaLyrics options');
    }
    const params = new URLSearchParams({ track: encodedTrack });
    if (options?.skipTrackSource !== undefined)
        params.set('skipTrackSource', String(options.skipTrackSource));
    return params;
}
function hasLavaLyricsPlugin(plugins) {
    return plugins.some(plugin => plugin.name.toLowerCase() === 'lavalyrics' ||
        plugin.name.toLowerCase() === 'lavalyrics-plugin');
}
//# sourceMappingURL=LavaLyricsContracts.js.map