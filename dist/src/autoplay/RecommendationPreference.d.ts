import type { Track } from '../entities/Track';
export interface RecommendationCandidate {
    readonly title: string;
    readonly author: string;
    readonly durationMs: number;
    readonly source: string;
    readonly isrc?: string;
}
export interface RecommendationPreferences {
    score(candidate: RecommendationCandidate, context: {
        readonly guildId: string;
        readonly seed: RecommendationCandidate;
    }): number;
}
export declare function preferredRecommendations(candidates: Track[], seed: Track, guildId: string, preferences?: RecommendationPreferences): Track[];
