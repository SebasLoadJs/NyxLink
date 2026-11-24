"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateNodeLinkStreamResponse = validateNodeLinkStreamResponse;
const ProtocolValidation_1 = require("./ProtocolValidation");
function validateNodeLinkStreamResponse(headers, expected) {
    const value = headers['content-type'];
    const contentType = typeof value === 'string' ? value.toLowerCase().split(';', 1)[0].trim() : '';
    const fail = (field) => { throw new ProtocolValidation_1.ProtocolResponseError('NodeLink loadStream', field); };
    if (!contentType ||
        contentType.startsWith('text/') ||
        contentType === 'application/json' ||
        contentType.endsWith('+json') ||
        contentType === 'application/xml' ||
        contentType.endsWith('+xml')) {
        fail('unexpected streaming Content-Type');
    }
    if (expected === 'passthrough') {
        if (headers['x-nodelink-passthrough'] !== 'true')
            fail('passthrough confirmation header');
        return;
    }
    if (expected === 'wav') {
        if (contentType !== 'audio/wav' && contentType !== 'audio/x-wav' &&
            contentType !== 'audio/wave' && contentType !== 'audio/vnd.wave') {
            fail('expected decoded WAV Content-Type');
        }
    }
    else if (contentType !== 'audio/l16') {
        fail('expected 48kHz stereo raw PCM Content-Type');
    }
}
//# sourceMappingURL=NodeLinkStreamResponse.js.map