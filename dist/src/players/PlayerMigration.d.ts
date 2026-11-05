import type { Player } from '../entities/Player';
import type { Node } from '../entities/Node';
export declare const migrationRestart: unique symbol;
export type RestartOptions = {
    destroyOnFailure?: boolean;
    startQueued?: boolean;
    [migrationRestart]?: boolean;
};
export declare function migratePlayer(player: Player, target: Node, ticket: number): Promise<boolean>;
