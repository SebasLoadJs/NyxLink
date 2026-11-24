export declare const lavalinkSponsorBlockCategories: readonly ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "music_offtopic", "filler"];
export type LavalinkSponsorBlockCategory = typeof lavalinkSponsorBlockCategories[number];
export declare function sponsorBlockCategoryBody(value: LavalinkSponsorBlockCategory[]): LavalinkSponsorBlockCategory[];
export declare function validateSponsorBlockCategories(value: unknown): asserts value is LavalinkSponsorBlockCategory[];
export declare function hasLavalinkSponsorBlockPlugin(plugins: readonly {
    name: string;
}[]): boolean;
export declare function lavalinkSponsorBlockPath(sessionId: string, guildId: string): string;
