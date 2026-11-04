import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';
export type FailoverOptions = {
    maxAttempts?: number;
    retryDelayMs?: number;
    retryJitter?: number;
    preserveOnFailure?: boolean;
};
export type FailoverResult = {
    status: 'recovered' | 'failed' | 'cancelled';
    attempts: number;
    node?: Node;
    reason?: 'queue-full';
};
export declare class NodeFailover {
    static move(player: Player, source: Node, options?: FailoverOptions): Promise<FailoverResult>;
    private static attempt;
}
