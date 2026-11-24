import type { Player } from '../entities/Player';
import type { Node } from '../entities/Node';
export type MigrationStage = 'select-target' | 'resolve-track' | 'restore-player' | 'persist-snapshot' | 'cleanup-source' | 'rollback' | 'cleanup-target';
export interface MigrationStageObservation {
    migrationId: string;
    guildId: string;
    source: string;
    target: string;
    stage: MigrationStage;
    status: 'started' | 'acknowledged' | 'failed' | 'cancelled' | 'partial';
    elapsedMs: number;
}
export declare const migrationRestart: unique symbol;
export type RestartOptions = {
    destroyOnFailure?: boolean;
    startQueued?: boolean;
    [migrationRestart]?: boolean;
};
export declare function migratePlayer(player: Player, target: Node, ticket: number): Promise<boolean>;
