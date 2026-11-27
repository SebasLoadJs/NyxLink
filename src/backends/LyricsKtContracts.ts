import { ProtocolResponseError } from './ProtocolValidation';

export interface LyricsKtTrack {
    title: string;
    author: string;
    album: string | null;
    albumArt: Array<{
        url: string;
        height: number;
        width: number;
    }>;
}

export interface LyricsKtLine {
    line: string;
    range: {
        start: number;
        end: number;
    } | null;
}

export type LyricsKtResult = {
    type: 'text';
    track: LyricsKtTrack;
    source: string;
    text: string;
} | {
    type: 'timed';
    track: LyricsKtTrack;
    source: string;
    lines: LyricsKtLine[];
};

export interface LyricsKtSearchTrack {
    videoId: string;
    title: string;
}

export interface LyricsKtOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 16384): value is string => typeof value === 'string' && value.length <= max;
const ms = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const videoId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
const fail = (field: string): never => { throw new ProtocolResponseError('Lyrics.kt', field); };
export function lyricsKtVideoPath(value: string): string {
    if (!videoId(value)) throw new TypeError('Invalid YouTube video ID');
    return '/v4/lyrics/' + value;
}
export function lyricsKtSearchPath(query: string): string {
    if (!text(query, 512) || !query.trim() || /[\x00-\x1f\x7f/\\]/.test(query) || query.trim() === '.' || query.trim() === '..') throw new TypeError('Invalid Lyrics.kt search query');
    return '/v4/lyrics/search/' + encodeURIComponent(query.trim());
}
export function lyricsKtTimeout(value?: number): number {
    const result = value ?? 10000;
    if (!Number.isSafeInteger(result) || result < 1 || result > 60000) throw new RangeError('Invalid Lyrics.kt timeout');
    return result;
}
export function readLyricsKtResult(value: unknown): LyricsKtResult {
    if (!record(value) || !record(value.track) || !text(value.source, 256)) return fail('lyrics envelope');
    const raw = value.track;
    if (!text(raw.title) || !text(raw.author) || !(raw.album === null || raw.album === undefined || text(raw.album)) || !Array.isArray(raw.albumArt) || raw.albumArt.length > 128) return fail('track');
    const albumArt = raw.albumArt.map(image => {
        if (!record(image) || !text(image.url, 8192) || !ms(image.height) || !ms(image.width)) return fail('album art');
        let url: URL;
        try { url = new URL(image.url); } catch { return fail('album art URL'); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return fail('album art URL');
        return {url:image.url,height:image.height,width:image.width};
    });
    const track: LyricsKtTrack = {title:raw.title,author:raw.author,album:raw.album ?? null,albumArt};
    if (value.type === 'text' && text(value.text, 1048576)) return {type:'text',track,source:value.source,text:value.text};
    if (value.type !== 'timed' || !Array.isArray(value.lines) || value.lines.length > 4096) return fail('lyrics type');
    const lines = value.lines.map(line => {
        if (!record(line) || !text(line.line)) return fail('lyrics line');
        const range = line.range;
        if (range === null || range === undefined) return {line:line.line,range:null};
        if (!record(range) || !ms(range.start) || !ms(range.end) || range.end < range.start) return fail('lyrics range');
        return {line:line.line,range:{start:range.start,end:range.end}};
    });
    return {type:'timed',track,source:value.source,lines};
}
export function readLyricsKtSearch(value: unknown): LyricsKtSearchTrack[] {
    if (!Array.isArray(value) || value.length > 4096) return fail('search results');
    return value.map(item => {
        if (!record(item) || !videoId(item.videoId) || !text(item.title)) return fail('search track');
        return {videoId:item.videoId,title:item.title};
    });
}
