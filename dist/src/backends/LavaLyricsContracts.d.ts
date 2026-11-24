export interface LavaLyricsLine {
    timestamp: number;
    duration: number | null;
    line: string;
    plugin: Record<string, unknown>;
}
export interface LavaLyricsData {
    sourceName: string;
    provider: string;
    text: string | null;
    lines: LavaLyricsLine[];
    plugin: Record<string, unknown>;
}
export interface LavaLyricsOptions {
    skipTrackSource?: boolean;
}
export declare function validateLavaLyrics(value: unknown): asserts value is LavaLyricsData;
export declare function lavaLyricsParameters(encodedTrack: string, options?: LavaLyricsOptions): URLSearchParams;
export declare function hasLavaLyricsPlugin(plugins: readonly {
    name: string;
}[]): boolean;
