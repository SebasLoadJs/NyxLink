"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preparePlayerUpdate = preparePlayerUpdate;
const FeatureUnavailableError_1 = require("../errors/FeatureUnavailableError");
const NodeLinkContracts_1 = require("./NodeLinkContracts");
const extensionFields = ['fading', 'nextTrack', 'loudnessNormalizer', 'crossfade'];
function preparePlayerUpdate(backend, payload, channelId, unavailable) {
    const extensions = extensionFields.filter(field => payload[field] !== undefined);
    if (payload.track?.audioTrackId !== undefined)
        extensions.push('audioTrackId');
    for (const feature of extensions) {
        if (backend !== 'nodelink' || unavailable?.(feature))
            throw new FeatureUnavailableError_1.FeatureUnavailableError(feature, backend);
    }
    const result = { ...payload };
    if (payload.crossfade !== undefined)
        result.crossfade = (0, NodeLinkContracts_1.normalizeCrossfade)(payload.crossfade);
    if (payload.voice) {
        const voice = { ...payload.voice };
        if (backend === 'nodelink' && (!voice.sessionId || !voice.token || !voice.endpoint)) {
            throw new Error('voice payload requires sessionId, token, and endpoint.');
        }
        if (!voice.channelId && channelId)
            voice.channelId = channelId;
        result.voice = voice;
    }
    return result;
}
//# sourceMappingURL=ProtocolContracts.js.map