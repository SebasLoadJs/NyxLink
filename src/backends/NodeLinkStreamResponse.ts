import { ProtocolResponseError } from './ProtocolValidation';

/**
 * Validate NodeLink's streaming *wire representation*, not merely HTTP 2xx.
 * Older servers may ignore a new requested format and return raw PCM, or a
 * misconfigured proxy may respond 200 with JSON/HTML. Passing those bytes to
 * an audio decoder would silently corrupt playback.
 */
export function validateNodeLinkStreamResponse(
    headers: Record<string, unknown>,
    expected: 'raw' | 'wav' | 'passthrough'
): void {
    const value = headers['content-type'];
    const contentType = typeof value === 'string' ? value.toLowerCase().split(';', 1)[0].trim() : '';
    const fail = (field: string): never => { throw new ProtocolResponseError('NodeLink loadStream', field); };

    if (!contentType ||
        contentType.startsWith('text/') ||
        contentType === 'application/json' ||
        contentType.endsWith('+json') ||
        contentType === 'application/xml' ||
        contentType.endsWith('+xml')) {
        fail('unexpected streaming Content-Type');
    }

    if (expected === 'passthrough') {
        // Modern NodeLink's original-source mode sets this marker on both
        // direct HTTP and source-managed paths. Refuse legacy servers which
        // accept the parameter but return PCM or another representation.
        if (headers['x-nodelink-passthrough'] !== 'true') fail('passthrough confirmation header');
        return;
    }

    if (expected === 'wav') {
        if (contentType !== 'audio/wav' && contentType !== 'audio/x-wav' &&
            contentType !== 'audio/wave' && contentType !== 'audio/vnd.wave') {
            fail('expected decoded WAV Content-Type');
        }
    } else if (contentType !== 'audio/l16') {
        fail('expected 48kHz stereo raw PCM Content-Type');
    }
}
