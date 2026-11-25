import type { BackendKind } from './BackendAdapter';

export interface SponsorSegment {
    category: string;
    start: number;
    end: number;
}
export interface SponsorChapter {
    name: string;
    start: number;
    end: number;
    duration: number;
}
type Base = { backend: BackendKind; guildId: string };
export type SponsorBlockObservation = Base & (
    { kind: 'segmentsLoaded'; segments: SponsorSegment[] } |
    { kind: 'segmentSkipped'; segment: SponsorSegment } |
    { kind: 'chaptersLoaded'; chapters: SponsorChapter[] } |
    { kind: 'chapterStarted'; chapter: SponsorChapter }
);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const ms = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
function segment(v: unknown): SponsorSegment | undefined {
    if (!object(v) || typeof v.category !== 'string' || !v.category || !ms(v.start) || !ms(v.end) || v.end < v.start) return;
    return { category: v.category, start: v.start, end: v.end };
}
function chapter(v: unknown): SponsorChapter | undefined {
    if (!object(v) || typeof v.name !== 'string' || !ms(v.start) || !ms(v.end) || v.end < v.start) return;
    const duration = typeof v.duration === 'string' && /^\d+$/.test(v.duration) ? Number(v.duration) : v.duration;
    if (!ms(duration)) return;
    return { name: v.name, start: v.start, end: v.end, duration };
}
function array<T>(v: unknown, parse: (v: unknown) => T | undefined): T[] | undefined {
    if (!Array.isArray(v) || v.length > 10000) return;
    const entries: T[] = [];
    for (const item of v) {
        const entry = parse(item);
        if (!entry) return;
        entries.push(entry);
    }
    return entries;
}
/** Translate distinct wire event names without inferring track identity from guild-only events. */
export function readSponsorBlockEvent(value: unknown, backend?: BackendKind): SponsorBlockObservation | undefined {
    if (!backend || !object(value) || value.op !== 'event' || typeof value.guildId !== 'string' || !/^\d{17,20}$/.test(value.guildId)) return;
    const base = { backend, guildId: value.guildId };
    if (value.type === (backend === 'nodelink' ? 'SponsorBlockSegmentsLoadedEvent' : 'SegmentsLoaded')) {
        const segments = array(value.segments, segment);
        if (segments) return { ...base, kind: 'segmentsLoaded', segments };
    }
    if (value.type === (backend === 'nodelink' ? 'SponsorBlockSegmentSkippedEvent' : 'SegmentSkipped')) {
        const entry = segment(value.segment);
        if (entry) return { ...base, kind: 'segmentSkipped', segment: entry };
    }
    if (backend === 'lavalink' && value.type === 'ChaptersLoaded') {
        const chapters = array(value.chapters, chapter);
        if (chapters) return { ...base, kind: 'chaptersLoaded', chapters };
    }
    if (backend === 'lavalink' && value.type === 'ChapterStarted') {
        const entry = chapter(value.chapter);
        if (entry) return { ...base, kind: 'chapterStarted', chapter: entry };
    }
}
