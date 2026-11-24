"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireMixId = requireMixId;
exports.requireMixVolume = requireMixVolume;
exports.mixCreateBody = mixCreateBody;
exports.validateMixCreated = validateMixCreated;
exports.validateMixLayers = validateMixLayers;
const ProtocolValidation_1 = require("./ProtocolValidation");
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    value.trim() === value && !/[\x00-\x1f\x7f]/.test(value) && !value.split('/').some(segment => segment === '.' || segment === '..');
function requireMixId(value) {
    if (!id(value))
        throw new TypeError('Invalid mix layer ID');
}
function requireMixVolume(value) {
    if (!nonnegative(value) || value > 1)
        throw new TypeError('Mix layer volume must be between 0 and 1');
}
function mixCreateBody(value) {
    if (!object(value) || !object(value.track) || typeof value.track.encoded !== 'string' || !value.track.encoded.trim())
        throw new TypeError('Mix creation requires an encoded track');
    if (value.volume !== undefined)
        requireMixVolume(value.volume);
    if (value.track.userData !== undefined && !object(value.track.userData))
        throw new TypeError('Invalid mix userData');
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        throw new TypeError('Mix creation must be JSON serializable');
    }
}
function validateMixCreated(value) {
    if (!object(value) || !id(value.id) || !nonnegative(value.volume) || value.volume > 1)
        throw new ProtocolValidation_1.ProtocolResponseError('mix create', 'layer identity or volume');
    (0, ProtocolValidation_1.validateTrackResponse)(value.track, 'mix create');
}
function validateMixLayers(value) {
    if (!object(value) || !Array.isArray(value.mixes))
        throw new ProtocolValidation_1.ProtocolResponseError('mix list', 'mixes envelope');
    const ids = new Set();
    for (const layer of value.mixes) {
        validateMixCreated(layer);
        if (!object(layer) || !nonnegative(layer.position) || !nonnegative(layer.startTime) || ids.has(layer.id))
            throw new ProtocolValidation_1.ProtocolResponseError('mix list', 'layer state or duplicate identity');
        ids.add(layer.id);
    }
}
//# sourceMappingURL=NodeLinkMixContracts.js.map