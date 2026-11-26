import type { NodeLinkMediaImage } from './NodeLinkMediaMetadata';
import { ProtocolResponseError } from './ProtocolValidation';
export type NodeLinkMediaLookup = {
    isrc: string;
} | {
    recordingMbid: string;
} | {
    workMbid: string;
} | {
    artistMbid: string;
} | {
    releaseGroupMbid: string;
};
export interface NodeLinkMediaCredit {
    mbid: string;
    name: string;
    role: string;
}
export interface NodeLinkMediaRecording {
    mbid: string;
    title: string;
    artists: Array<{
        mbid: string;
        name: string;
    }>;
    durationMs?: number;
    credits: NodeLinkMediaCredit[];
    workMbids: string[];
    releaseGroups: Array<{
        mbid: string;
        title: string;
        firstReleaseDate?: string;
        type?: string;
    }>;
}
export type NodeLinkMediaLookupResult = {
    provider: 'musicbrainz';
    isrc: string;
    recordings: NodeLinkMediaRecording[];
} | (NodeLinkMediaRecording & {
    provider: 'musicbrainz';
    isrcs: string[];
}) | {
    provider: 'musicbrainz';
    mbid: string;
    title?: string;
    credits: NodeLinkMediaCredit[];
    workMbids: string[];
} | {
    provider: 'fanart.tv';
    mbid: string;
    name?: string;
    artwork: NodeLinkMediaImage[];
    banners: NodeLinkMediaImage[];
    backgrounds: NodeLinkMediaImage[];
    logos: NodeLinkMediaImage[];
} | {
    provider: 'fanart.tv';
    releaseGroupMbid: string;
    artistName?: string;
    artwork: NodeLinkMediaImage[];
    discArtwork: NodeLinkMediaImage[];
};

const keys = ['isrc','recordingMbid','workMbid','artistMbid','releaseGroupMbid'] as const;
type Key = typeof keys[number];
const obj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => typeof v === 'string' && v.trim() && v.length <= 512 ? v : undefined;
const mbid = (v: unknown): string | undefined => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : undefined;
function isrc(v: unknown): string | undefined {
    if (typeof v !== 'string' || v.length > 32) return undefined;
    const s = v.trim().toUpperCase().replace(/-/g,'');
    return /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(s) ? s : undefined;
}
export function mediaLookupQuery(value: unknown): { key: Key; id: string; query: URLSearchParams } {
    if (!obj(value) || Object.keys(value).length !== 1) throw new TypeError('Media lookup requires exactly one identifier');
    const key = keys.find(k => Object.hasOwn(value,k));
    if (!key) throw new TypeError('Unknown media lookup identifier');
    const id = key === 'isrc' ? isrc(value[key]) : mbid(value[key]);
    if (!id) throw new TypeError('Invalid media lookup identifier');
    return { key,id,query:new URLSearchParams([[key,id]]) };
}
function rows<T>(v: unknown, max: number, parse: (r: unknown) => T | undefined): T[] {
    if (!Array.isArray(v) || v.length > max) throw new ProtocolResponseError('media lookup','collection');
    const out: T[] = [];
    for (const item of v) { const row = parse(item); if (row === undefined) throw new ProtocolResponseError('media lookup','collection item'); out.push(row); }
    return out;
}
function relations(v: Record<string,unknown>) {
    const credits = rows(v.credits,250,raw=>{if(!obj(raw))return;const id=mbid(raw.mbid),name=str(raw.name),role=str(raw.role);return id&&name&&role?{mbid:id,name,role}:undefined;});
    return {credits,workMbids:rows(v.workMbids,250,mbid)};
}
function recording(v: unknown): NodeLinkMediaRecording | undefined {
    if (!obj(v)) return;
    const id=mbid(v.mbid),title=str(v.title); if(!id||!title)return;
    const artists=rows(v.artists,50,raw=>{if(!obj(raw))return;const id=mbid(raw.mbid),name=str(raw.name);return id&&name?{mbid:id,name}:undefined;});
    const releaseGroups=rows(v.releaseGroups,100,raw=>{if(!obj(raw))return;const id=mbid(raw.mbid),title=str(raw.title);return id&&title?{mbid:id,title,firstReleaseDate:str(raw.firstReleaseDate),type:str(raw.type)}:undefined;});
    const durationMs=typeof v.durationMs==='number'&&Number.isSafeInteger(v.durationMs)&&v.durationMs>=0?v.durationMs:undefined;
    return {mbid:id,title,artists,durationMs,...relations(v),releaseGroups};
}
function image(raw: unknown): NodeLinkMediaImage | undefined {
    if (!obj(raw) || typeof raw.url !== 'string' || raw.url.length > 8192) return;
    try {
        const u=new URL(raw.url); if(u.protocol!=='https:'||u.hostname!=='assets.fanart.tv'||u.port||u.username||u.password)return;
        const dimension=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?v:undefined;
        return {url:raw.url,width:dimension(raw.width),height:dimension(raw.height)};
    } catch { return; }
}
export function validateMediaLookup(value: unknown,key: Key,id: string): NodeLinkMediaLookupResult {
    const fail=()=>{throw new ProtocolResponseError('media lookup','provider or identity');};
    if(!obj(value))return fail();
    if(key==='isrc') {
        if(value.provider!=='musicbrainz'||isrc(value.isrc)!==id)return fail();
        return {provider:'musicbrainz',isrc:id,recordings:rows(value.recordings,100,recording)};
    }
    if(key==='recordingMbid') {
        if(value.provider!=='musicbrainz'||mbid(value.mbid)!==id)return fail();
        const row=recording(value); if(!row)return fail();
        return {...row,provider:'musicbrainz',isrcs:rows(value.isrcs,250,isrc)};
    }
    if(key==='workMbid') {
        if(value.provider!=='musicbrainz'||mbid(value.mbid)!==id)return fail();
        return {provider:'musicbrainz',mbid:id,title:str(value.title),...relations(value)};
    }
    if(key==='artistMbid') {
        if(value.provider!=='fanart.tv'||mbid(value.mbid)!==id)return fail();
        return {provider:'fanart.tv',mbid:id,name:str(value.name),artwork:rows(value.artwork,50,image),banners:rows(value.banners,50,image),backgrounds:rows(value.backgrounds,100,image),logos:rows(value.logos,100,image)};
    }
    if(value.provider!=='fanart.tv'||mbid(value.releaseGroupMbid)!==id)return fail();
    return {provider:'fanart.tv',releaseGroupMbid:id,artistName:str(value.artistName),artwork:rows(value.artwork,50,image),discArtwork:rows(value.discArtwork,50,image)};
}
