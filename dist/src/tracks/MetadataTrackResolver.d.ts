import type { Node } from '../entities/Node';
import type { Track } from '../entities/Track';
import type { ITrack } from '../typings/Interfaces';
export interface MetadataResolutionOptions {
    sources: readonly ('youtube' | 'youtubemusic' | 'soundcloud')[];
    minimumScore?: number;
    durationToleranceMs?: number;
    maxCandidates?: number;
    timeoutMs?: number;
}
export declare function resolveMetadata(track: Track, node: Node, options: MetadataResolutionOptions, callerSignal?: AbortSignal): Promise<ITrack | undefined>;
