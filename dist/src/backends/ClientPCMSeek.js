"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_CLIENT_PCM_SEEK_MS = exports.PCM_BYTES_PER_MS = void 0;
exports.assertClientPcmSeekPosition = assertClientPcmSeekPosition;
exports.createClientPcmSeekStream = createClientPcmSeekStream;
const node_stream_1 = require("node:stream");
exports.PCM_BYTES_PER_MS = 192;
exports.MAX_CLIENT_PCM_SEEK_MS = 30000;
function assertClientPcmSeekPosition(positionMs) {
    if (!Number.isSafeInteger(positionMs) || positionMs < 0 || positionMs > exports.MAX_CLIENT_PCM_SEEK_MS) {
        throw new RangeError('Client PCM seek position must be an integer from 0 to 30000 milliseconds');
    }
}
function createClientPcmSeekStream(source, positionMs) {
    assertClientPcmSeekPosition(positionMs);
    let remaining = positionMs * exports.PCM_BYTES_PER_MS;
    const crop = new node_stream_1.Transform({
        transform(chunk, _encoding, callback) {
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (remaining > 0) {
                const skipped = Math.min(remaining, data.length);
                remaining -= skipped;
                if (skipped < data.length)
                    this.push(data.subarray(skipped));
            }
            else {
                this.push(data);
            }
            callback();
        },
        flush(callback) {
            if (remaining > 0) {
                const error = Object.assign(new RangeError('PCM stream ended before the requested seek position'), {
                    code: 'PCM_SEEK_BEYOND_SOURCE',
                });
                callback(error);
                return;
            }
            callback();
        },
    });
    (0, node_stream_1.pipeline)(source, crop, () => {
    });
    return crop;
}
//# sourceMappingURL=ClientPCMSeek.js.map