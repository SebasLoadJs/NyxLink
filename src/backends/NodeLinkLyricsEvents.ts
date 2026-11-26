/** Optional observation of NodeLink lyrics events. Legacy raw events are unchanged.
 * Timing is supplied by the node; the reader does not invent timestamps or translations.
 */
export interface NodeLinkLyricWord {
    text: string;
    timestamp?: number;
    time?: number;
    duration?: number;
}
export interface NodeLinkLyricAnnotation {
    kind?: 'lyric' | 'instrumental';
    section?: string;
    agent?: string;
    isBackground?: boolean;
    alternatives?: Array<{
        kind: 'translation' | 'romanization';
        text: string;
        language?: string;
    }>;
}
export interface NodeLinkPlaybackLyricLine {
    timestamp: number;
    duration: number;
    line: string;
    words: NodeLinkLyricWord[];
    plugin: NodeLinkLyricAnnotation;
}
export type NodeLinkLyricsObservation = {
    guildId: string;
    kind: 'notFound';
} | {
    guildId: string;
    kind: 'found';
    lyrics: {
        sourceName?: string;
        provider?: string;
        synced?: boolean;
        text: string;
        lines: NodeLinkPlaybackLyricLine[];
    };
} | {
    guildId: string;
    kind: 'line';
    lineIndex: number;
    line: NodeLinkPlaybackLyricLine;
    skipped?: boolean;
    activeLineIndices?: number[];
};

const obj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const ms = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const index = (v: unknown): v is number => ms(v) && Number.isSafeInteger(v);
const text = (v: unknown, max = 16384): v is string => typeof v === 'string' && v.length <= max;
function annotation(v: unknown): NodeLinkLyricAnnotation {
    const result: NodeLinkLyricAnnotation = {};
    if (!obj(v)) return result;
    if (v.kind === 'lyric' || v.kind === 'instrumental') result.kind = v.kind;
    if (text(v.section, 512)) result.section = v.section;
    if (text(v.agent, 512)) result.agent = v.agent;
    if (typeof v.isBackground === 'boolean') result.isBackground = v.isBackground;
    if (Array.isArray(v.alternatives)) {
        const alternatives: NonNullable<NodeLinkLyricAnnotation['alternatives']> = [];
        for (const a of v.alternatives.slice(0, 32)) {
            if (!obj(a) || (a.kind !== 'translation' && a.kind !== 'romanization') || !text(a.text)) continue;
            alternatives.push({kind:a.kind,text:a.text,...(text(a.language,64)?{language:a.language}:{})});
        }
        if (alternatives.length) result.alternatives = alternatives;
    }
    return result;
}
function line(v: unknown): NodeLinkPlaybackLyricLine | undefined {
    if (!obj(v) || !ms(v.timestamp) || !ms(v.duration) || !text(v.line) ||
        !Array.isArray(v.words) || v.words.length > 1024) return;
    const words: NodeLinkLyricWord[] = [];
    for (const word of v.words) {
        if (!obj(word) || !text(word.text, 4096)) continue;
        const item: NodeLinkLyricWord = {text:word.text};
        if (ms(word.timestamp)) item.timestamp = word.timestamp;
        if (ms(word.time)) item.time = word.time;
        if (ms(word.duration)) item.duration = word.duration;
        words.push(item);
    }
    return {timestamp:v.timestamp,duration:v.duration,line:v.line,words,plugin:annotation(v.plugin)};
}
export function readNodeLinkLyricsEvent(value: unknown): NodeLinkLyricsObservation | undefined {
    if (!obj(value) || value.op !== 'event' || typeof value.guildId !== 'string' || !/^\d{17,20}$/.test(value.guildId)) return;
    const guildId = value.guildId;
    if (value.type === 'LyricsNotFoundEvent') return {guildId,kind:'notFound'};
    if (value.type === 'LyricsFoundEvent') {
        const data = value.lyrics;
        if (!obj(data) || !text(data.text, 1048576) || !Array.isArray(data.lines) || data.lines.length > 4096) return;
        const lines: NodeLinkPlaybackLyricLine[] = [];
        for (const raw of data.lines) { const item=line(raw); if(!item)return; lines.push(item); }
        return {guildId,kind:'found',lyrics:{text:data.text,lines,
            ...(text(data.sourceName,128)?{sourceName:data.sourceName}:{}),
            ...(text(data.provider,128)?{provider:data.provider}:{}),
            ...(typeof data.synced==='boolean'?{synced:data.synced}:{})}};
    }
    if (value.type === 'LyricsLineEvent' && index(value.lineIndex) && value.lineIndex < 4096) {
        const item=line(value.line); if(!item)return;
        const active=value.activeLineIndices;
        if (active!==undefined && (!Array.isArray(active) || active.length>4096 || !active.every(n=>index(n)&&n<4096))) return;
        return {guildId,kind:'line',lineIndex:value.lineIndex,line:item,
            ...(typeof value.skipped==='boolean'?{skipped:value.skipped}:{}),
            ...(Array.isArray(active)?{activeLineIndices:[...new Set<number>(active)]}:{})};
    }
}
