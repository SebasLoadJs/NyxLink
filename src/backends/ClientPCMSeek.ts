import { Readable, Transform, pipeline } from 'node:stream';

/** NodeLink emits S16LE stereo PCM at 48 kHz: 192 bytes per millisecond. */
export const PCM_BYTES_PER_MS = 192;

/**
 * An explicit safety budget. Skipping N ms still makes NodeLink decode N ms
 * from the beginning and costs bandwidth, CPU and latency.
 */
export const MAX_CLIENT_PCM_SEEK_MS = 30000;

export function assertClientPcmSeekPosition(positionMs: number): void {
    if (!Number.isSafeInteger(positionMs) || positionMs < 0 || positionMs > MAX_CLIENT_PCM_SEEK_MS) {
        throw new RangeError('Client PCM seek position must be an integer from 0 to 30000 milliseconds');
    }
}

/**
 * Backpressure-aware, bounded-memory client seek over NodeLink raw PCM.
 * This is NOT a server seek. It never rewrites or fabricates remote track
 * metadata. Stream errors and premature closes remain errors; no silence
 * is fabricated to disguise truncated audio.
 */
export function createClientPcmSeekStream(source: NodeJS.ReadableStream, positionMs: number): Readable {
    assertClientPcmSeekPosition(positionMs);

    let remaining = positionMs * PCM_BYTES_PER_MS;
    const crop = new Transform({
        transform(chunk: Buffer | Uint8Array, _encoding, callback) {
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (remaining > 0) {
                const skipped = Math.min(remaining, data.length);
                remaining -= skipped;
                if (skipped < data.length) this.push(data.subarray(skipped));
            } else {
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

    // pipeline propagates source errors, premature closure and consumer
    // cancellation in both directions while preserving stream backpressure.
    pipeline(source as Readable, crop, () => {
        // The readable side delivers the original error to its consumer.
        // The callback prevents a second unhandled pipeline rejection.
    });
    return crop;
}
