/** Canonical names avoid ambiguous NodeLink aliases such as amsearch (Apple/Amazon). */
const prefixes: Readonly<Record<string, string>> = Object.freeze({
    youtube: 'ytsearch', youtubemusic: 'ytmsearch', soundcloud: 'scsearch',
    spotify: 'spsearch', deezer: 'dzsearch', applemusic: 'amsearch', tidal: 'tdsearch',
    amazonmusic: 'azsearch', lastfm: 'lfsearch', shazam: 'shsearch', songlink: 'slsearch'
});
const providers: Readonly<Record<string, string>> = Object.freeze({
    ytsearch: 'youtube', ytmsearch: 'youtube', scsearch: 'soundcloud',
    spsearch: 'spotify', sprec: 'spotify', dzsearch: 'deezer', dzrec: 'deezer',
    amsearch: 'applemusic', tdsearch: 'tidal', tdrec: 'tidal', ytrec: 'youtube',
    azsearch: 'amazonmusic', lfsearch: 'lastfm', shsearch: 'shazam', szsearch: 'shazam',
    slsearch: 'songlink', local: 'local'
});
const nodeLinkOnly = new Set(['azsearch', 'lfsearch', 'shsearch', 'szsearch', 'slsearch', 'tdrec', 'ytrec', 'dzrec']);
export function sourcePrefix(source: string): string {
    const key = source.toLowerCase();
    return Object.hasOwn(prefixes, key) ? prefixes[key] : key;
}
export function sourceProvider(source: string): string | undefined {
    const prefix = sourcePrefix(source);
    return Object.hasOwn(providers, prefix) ? providers[prefix] : undefined;
}
export function requiresNodeLink(source: string): boolean { return nodeLinkOnly.has(sourcePrefix(source)); }
export function disabledSource(source: string, disabled: readonly string[]): boolean {
    const key = source.toLowerCase(), provider = sourceProvider(key);
    return disabled.some(item => {
        const name = item.toLowerCase();
        return name === key || sourcePrefix(name) === sourcePrefix(key) || provider !== undefined && sourceProvider(name) === provider;
    });
}
