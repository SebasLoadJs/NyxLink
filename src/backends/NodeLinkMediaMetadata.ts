/** Experimental read-only projection of NodeLink PR #265 pluginInfo.media.
 * The provider owns the metadata. No URL is fetched by this module.
 */
export interface NodeLinkMediaImage {
    url: string;
    width?: number;
    height?: number;
}
export interface NodeLinkMediaArtist {
    name: string;
    id?: string;
    url?: string;
    artwork?: NodeLinkMediaImage[];
    banners?: NodeLinkMediaImage[];
    biography?: { text: string; source?: string; summary?: string };
}
export interface NodeLinkMediaMetadata {
    provider: string;
    artists: NodeLinkMediaArtist[];
    album?: { name?: string; id?: string; artwork?: NodeLinkMediaImage[]; url?: string; releaseDate?: string; copyright?: string; label?: string; type?: string; trackCount?: number; discCount?: number };
    artwork?: NodeLinkMediaImage[];
    canvas?: { url: string; id?: string; uri?: string; fileId?: string; type?: string };
    motionArtwork?: { url: string; scope?: 'track' | 'album'; variants?: Array<NodeLinkMediaImage & { aspectRatio: '1:1' | '3:4' | '9:16' }> };
    identifiers?: { isrc?: string; upc?: string; ean?: string };
    credits?: Array<{ name: string; role: string }>;
    colors?: { dark?: string; light?: string; raw?: string; palette?: Record<string, unknown> };
    catalog?: Record<string, unknown>;
    channel?: { name?: string; id?: string; artwork?: NodeLinkMediaImage[]; banners?: NodeLinkMediaImage[] };
}
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => typeof v === 'string' && v.trim() && v.length <= 16384 ? v : undefined;
const integer = (v: unknown): number | undefined => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : undefined;
function url(v: unknown): string | undefined {
    if (typeof v !== 'string' || v.length > 8192) return undefined;
    try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? v : undefined; } catch { return undefined; }
}
function rows(v: unknown): Record<string, unknown>[] {
    return Array.isArray(v) ? v.slice(0, 256).filter(record) : [];
}
function image(v: Record<string, unknown>): NodeLinkMediaImage | undefined {
    const link = url(v.url);
    return link ? { url: link, width: integer(v.width), height: integer(v.height) } : undefined;
}
function images(v: unknown): NodeLinkMediaImage[] | undefined {
    const result = rows(v).map(image).filter((x): x is NodeLinkMediaImage => x !== undefined);
    return result.length ? result : undefined;
}
function named(v: Record<string, unknown>) {
    return { name: str(v.name), id: str(v.id), artwork: images(v.artwork), banners: images(v.banners) };
}
function strings(v: Record<string, unknown>, keys: readonly string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const k of keys) { const s = str(v[k]); if (s !== undefined) result[k] = s; }
    return result;
}
function hex(v: unknown): string | undefined {
    return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined;
}
function palette(v: unknown): Record<string, unknown> | undefined {
    if (!record(v)) return undefined;
    const result: Record<string, unknown> = {};
    for (const mode of ['dark', 'light']) {
        const theme = v[mode];
        if (!record(theme)) continue;
        const out: Record<string, unknown> = {};
        const base = hex(theme.encoreBaseSetTextColor);
        if (base) out.encoreBaseSetTextColor = base;
        for (const level of ['minContrast', 'highContrast', 'higherContrast']) {
            const input = theme[level];
            if (!record(input)) continue;
            const colors: Record<string, string> = {};
            for (const key of ['backgroundBase', 'backgroundTintedBase', 'textBase', 'textBrightAccent', 'textSubdued']) {
                const color = hex(input[key]); if (color) colors[key] = color;
            }
            if (Object.keys(colors).length) out[level] = colors;
        }
        if (Object.keys(out).length) result[mode] = out;
    }
    if ((v.bestFit === 'dark' || v.bestFit === 'light') && result[v.bestFit]) result.bestFit = v.bestFit;
    return Object.keys(result).length ? result : undefined;
}
function catalog(v: unknown): Record<string, unknown> | undefined {
    if (!record(v)) return undefined;
    const out: Record<string, unknown> = strings(v, ['version', 'copyright', 'audioQuality', 'releaseDate']);
    for (const k of ['trackNumber', 'discNumber', 'popularity']) {
        const n = v[k]; if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[k] = n;
    }
    if (typeof v.explicit === 'boolean') out.explicit = v.explicit;
    for (const k of ['url', 'previewUrl']) { const u = url(v[k]); if (u) out[k] = u; }
    for (const k of ['audioModes', 'mediaTags', 'genres']) {
        const list = v[k]; if (Array.isArray(list)) out[k] = list.slice(0, 256).map(str).filter(x => x !== undefined);
    }
    if (record(v.audioSpecifications)) {
        const specs: Record<string, unknown> = {};
        for (const k of ['maximumBitDepth', 'maximumSamplingRateHz', 'maximumChannelCount']) { const n = integer(v.audioSpecifications[k]); if (n !== undefined) specs[k] = n; }
        for (const k of ['hiRes', 'hiResStreamable']) { const b = v.audioSpecifications[k]; if (typeof b === 'boolean') specs[k] = b; }
        if (Object.keys(specs).length) out.audioSpecifications = specs;
    }
    return Object.keys(out).length ? out : undefined;
}
/** Optional detached metadata; unknown or malformed data never fabricates a provider or artwork. */
export function readNodeLinkMediaMetadata(pluginInfo: unknown): NodeLinkMediaMetadata | undefined {
    if (!record(pluginInfo) || !record(pluginInfo.media)) return undefined;
    const m = pluginInfo.media;
    const provider = str(m.provider);
    if (!provider || !Array.isArray(m.artists)) return undefined;
    const artists: NodeLinkMediaArtist[] = [];
    for (const item of rows(m.artists)) {
        const name = str(item.name); if (!name) continue;
        const bio = record(item.biography) ? item.biography : undefined;
        const text = bio ? str(bio.text) : undefined;
        artists.push({ ...named(item), name, url: url(item.url), biography: bio && text ? { text, source: str(bio.source), summary: str(bio.summary) } : undefined });
    }
    const result: NodeLinkMediaMetadata = { provider, artists, artwork: images(m.artwork), catalog: catalog(m.catalog) };
    if (record(m.album)) result.album = { ...strings(m.album, ['name','id','releaseDate','copyright','label','type']), artwork: images(m.album.artwork), url: url(m.album.url), trackCount: integer(m.album.trackCount), discCount: integer(m.album.discCount) };
    if (record(m.channel)) result.channel = named(m.channel);
    if (record(m.canvas)) {
        const link = url(m.canvas.url); if (link) result.canvas = { ...strings(m.canvas, ['id','uri','fileId','type']), url: link };
    }
    if (record(m.motionArtwork)) {
        const link = url(m.motionArtwork.url);
        if (link) {
            const variants: NonNullable<NonNullable<NodeLinkMediaMetadata['motionArtwork']>['variants']> = [];
            for (const item of rows(m.motionArtwork.variants)) {
                const img = image(item), ratio = item.aspectRatio;
                if (img && (ratio === '1:1' || ratio === '3:4' || ratio === '9:16')) variants.push({ ...img, aspectRatio: ratio });
            }
            const scope = m.motionArtwork.scope;
            result.motionArtwork = { url: link, scope: scope === 'album' || scope === 'track' ? scope : undefined, variants: variants.length ? variants : undefined };
        }
    }
    if (record(m.identifiers)) {
        const id = strings(m.identifiers, ['isrc','upc','ean']);
        result.identifiers = { isrc: /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/i.test(id.isrc ?? '') ? id.isrc : undefined, upc: /^[0-9]{8,14}$/.test(id.upc ?? '') ? id.upc : undefined, ean: /^[0-9]{8,14}$/.test(id.ean ?? '') ? id.ean : undefined };
    }
    if (record(m.colors)) result.colors = { dark: hex(m.colors.dark), light: hex(m.colors.light), raw: hex(m.colors.raw), palette: palette(m.colors.palette) };
    const credits: NonNullable<NodeLinkMediaMetadata['credits']> = [];
    for (const c of rows(m.credits)) { const name = str(c.name), role = str(c.role); if (name && role) credits.push({ name, role }); }
    if (credits.length) result.credits = credits;
    return result;
}
