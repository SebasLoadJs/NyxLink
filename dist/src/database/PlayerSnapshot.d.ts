import type { Player } from '../entities/Player';
import type { IPlayerConfig } from '../typings/Interfaces';
import { type TrackSnapshot } from '../tracks/TrackCodec';
export type PlayerSnapshotData = Omit<IPlayerConfig, 'current' | 'queue' | 'previous'> & {
    current: TrackSnapshot | null;
    queue: TrackSnapshot[];
    previous: TrackSnapshot[];
    volume: number;
    playing: boolean;
    paused: boolean;
    autoPlay: boolean;
    autoLeave: boolean;
    loop: 'off' | 'track' | 'queue';
    filters?: Record<string, unknown>;
};
export type PlayerSnapshot = {
    schemaVersion: 1;
    revision: string | null;
    data: PlayerSnapshotData;
};
export declare class SnapshotValidationError extends TypeError {
    readonly code = "INVALID_SNAPSHOT";
    constructor(message: string);
}
export declare class SnapshotConflictError extends Error {
    readonly code = "SNAPSHOT_CONFLICT";
    constructor();
}
export declare function recordRevision(value: unknown): string | null;
export declare function snapshotJSON<T>(value: T): T;
export declare class PlayerSnapshotCodec {
    static fromRecord(record: unknown): PlayerSnapshot;
    static parse(input: unknown): PlayerSnapshot;
    static capture(player: Player, revision: string | null): PlayerSnapshot;
}
