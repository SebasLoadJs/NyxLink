"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSourceHealth = validateSourceHealth;
exports.lyricsParameters = lyricsParameters;
exports.validateSourceHealthEntry = validateSourceHealthEntry;
exports.validateSourceHealthEvent = validateSourceHealthEvent;
exports.normalizeCrossfade = normalizeCrossfade;
exports.validateNodeLinkStreamFormats = validateNodeLinkStreamFormats;
const ProtocolValidation_1 = require("./ProtocolValidation");
const statuses = ['unknown', 'idle', 'healthy', 'degraded', 'unavailable', 'rate_limited', 'restricted', 'misconfigured'];
const obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const number = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const count = (v) => number(v) && Number.isSafeInteger(v);
const timestamp = (v) => v === null || number(v);
const optional = (v, check) => v === undefined || check(v);
function validateSourceHealth(value) {
    const invalid = (field) => { throw new ProtocolValidation_1.ProtocolResponseError('source health', field); };
    if (!obj(value) || typeof value.enabled !== 'boolean' || !number(value.timestamp) ||
        !obj(value.summary) || !obj(value.sources) || !obj(value.probe))
        throw new ProtocolValidation_1.ProtocolResponseError('source health', 'envelope');
    const summary = value.summary;
    for (const key of ['total', ...statuses])
        if (!count(summary[key]))
            invalid('summary counters');
    for (const [source, entry] of Object.entries(value.sources)) {
        if (!/^[\w.-]+$/.test(source) || !obj(entry))
            throw new ProtocolValidation_1.ProtocolResponseError('source health', 'source entry');
        validateSourceHealthEntry(entry);
    }
    const p = value.probe;
    if (typeof p.enabled !== 'boolean' || typeof p.running !== 'boolean' || !number(p.intervalMs) ||
        !timestamp(p.nextRunAt) || !timestamp(p.lastRunAt) || !count(p.eligibleSources) ||
        !Array.isArray(p.nextSources) || !p.nextSources.every(v => typeof v === 'string') ||
        !Array.isArray(p.currentSources) || !p.currentSources.every(v => obj(v) && typeof v.source === 'string' && number(v.startedAt)))
        invalid('probe');
}
function lyricsParameters(encodedTrack, options) {
    if (typeof encodedTrack !== 'string' || !encodedTrack.trim())
        throw new TypeError('Lyrics require an encoded track');
    const params = new URLSearchParams({ encodedTrack });
    const request = typeof options === 'string' ? { lang: options } : options ?? {};
    if (!obj(request))
        throw new TypeError('Invalid lyrics options');
    for (const key of ['lang', 'source']) {
        const value = request[key];
        if (value !== undefined) {
            if (typeof value !== 'string')
                throw new TypeError('Invalid lyrics option: ' + key);
            if (value.trim())
                params.set(key, value.trim());
        }
    }
    if (request.type !== undefined) {
        if (request.type !== 'lyrics' && request.type !== 'onlyCaptions')
            throw new TypeError('Invalid lyrics request type');
        params.set('type', request.type);
    }
    return params;
}
function validateSourceHealthEntry(entry) {
    if (!obj(entry))
        throw new ProtocolValidation_1.ProtocolResponseError('source health', 'source entry');
    if (!statuses.some(status => status === entry.status) ||
        !optional(entry.successRate, v => number(v) && v <= 100) ||
        !optional(entry.circuitBreaker, v => ['CLOSED', 'OPEN', 'HALF_OPEN'].some(state => state === v)) ||
        !optional(entry.latency, v => obj(v) && number(v.p50) && number(v.p95) && number(v.jitter) && optional(v.average, number)) ||
        !optional(entry.totalRequests, count) || !optional(entry.consecutiveFailures, count) ||
        !optional(entry.lastActivityAt, timestamp) || !optional(entry.lastSuccessAt, timestamp) ||
        !optional(entry.lastFailureAt, timestamp) ||
        !optional(entry.message, v => typeof v === 'string') ||
        !optional(entry.reason, v => v === null || typeof v === 'string') ||
        !optional(entry.recommendedAction, v => v === null || typeof v === 'string'))
        throw new ProtocolValidation_1.ProtocolResponseError('source health', 'source telemetry');
}
function validateSourceHealthEvent(value) {
    if (!obj(value) || value.op !== 'event')
        throw new ProtocolValidation_1.ProtocolResponseError('source health event', 'envelope');
    if (value.type === 'SourceHealthSnapshotEvent') {
        if (!obj(value.sources) || !optional(value.timestamp, number))
            throw new ProtocolValidation_1.ProtocolResponseError('source health event', 'snapshot');
        for (const [source, entry] of Object.entries(value.sources)) {
            if (!/^[\w.-]+$/.test(source))
                throw new ProtocolValidation_1.ProtocolResponseError('source health event', 'source name');
            validateSourceHealthEntry(entry);
        }
    }
    else if (value.type === 'SourceHealthChangeEvent') {
        if (typeof value.source !== 'string' || !/^[\w.-]+$/.test(value.source) ||
            !statuses.some(status => status === value.previousStatus) || !number(value.timestamp)) {
            throw new ProtocolValidation_1.ProtocolResponseError('source health event', 'change');
        }
        validateSourceHealthEntry(value);
    }
    else
        throw new ProtocolValidation_1.ProtocolResponseError('source health event', 'type');
}
function normalizeCrossfade(value) {
    if (!obj(value) || typeof value.enabled !== 'boolean')
        throw new TypeError('Crossfade requires an enabled boolean');
    const result = { enabled: value.enabled };
    for (const key of ['duration', 'minBufferMs', 'bufferMs']) {
        const v = value[key];
        if (v === undefined)
            continue;
        if (!number(v) || !Number.isSafeInteger(v) || v > 30000 || key === 'minBufferMs' && v < 20)
            throw new TypeError('Invalid crossfade ' + key);
        result[key] = v;
    }
    if (value.curve !== undefined) {
        if (value.curve !== 'linear' && value.curve !== 'sine' && value.curve !== 'sinusoidal')
            throw new TypeError('Invalid crossfade curve');
        result.curve = value.curve;
    }
    if (value.mode !== undefined) {
        if (value.mode !== 'stream' && value.mode !== 'smart' && value.mode !== 'preload')
            throw new TypeError('Invalid crossfade mode');
        result.mode = value.mode;
    }
    return result;
}
function validateNodeLinkStreamFormats(value) {
    const invalid = (part) => { throw new ProtocolValidation_1.ProtocolResponseError('NodeLink stream formats', part); };
    const nullableString = (v) => v === null || typeof v === 'string';
    const nullableCount = (v) => v === null || number(v);
    const nullableItag = (v) => v === null || (count(v) && v > 0);
    if (!obj(value))
        invalid('envelope');
    const catalogue = value;
    if (typeof catalogue.source !== 'string' || typeof catalogue.protocol !== 'string' ||
        !nullableString(catalogue.format) || typeof catalogue.mimeType !== 'string' || !nullableItag(catalogue.itag) ||
        typeof catalogue.seekable !== 'boolean' || typeof catalogue.byteRangeSupported !== 'boolean' ||
        !Array.isArray(catalogue.formats) || catalogue.formats.length > 256)
        invalid('envelope');
    const formats = catalogue.formats;
    for (const format of formats) {
        if (!obj(format) || !nullableItag(format.itag) ||
            ![null, 'audio', 'video', 'muxed'].includes(format.type) ||
            !nullableString(format.format) || !nullableString(format.codec) ||
            !nullableString(format.mimeType) || !nullableString(format.quality) ||
            !nullableCount(format.bitrate) || !nullableCount(format.width) ||
            !nullableCount(format.height) || !nullableCount(format.fps) ||
            !nullableCount(format.contentLength))
            invalid('format entry');
    }
}
//# sourceMappingURL=NodeLinkContracts.js.map