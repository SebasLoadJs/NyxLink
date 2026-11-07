import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';
type TrackData = {
    encoded?: string;
    userData?: Record<string, any>;
};
export declare class PlaybackAttempt {
    private readonly player;
    private current?;
    private preloaded?;
    constructor(player: Player);
    private create;
    private decorate;
    begin<T extends TrackData>(node: Node, track: T, restoring?: boolean): {
        track: T;
        accepted: (response: any) => boolean;
        rollback: () => void;
    };
    preload<T extends TrackData>(node: Node, track: T | null): {
        track: T;
        rollback: () => void;
    };
    private active;
    start(node: Node, track: TrackData): 'current' | 'preloaded' | false;
    end(node: Node, track: TrackData): boolean;
    accepts(node: Node, track: TrackData): boolean;
    isRestoring(): boolean;
    retain(ticket: number): void;
    checkpoint(): (ticket: number) => void;
    clean<T extends TrackData>(track: T): T;
}
export declare function playbackAttempt(player: Player): PlaybackAttempt;
export {};
