import type { Node } from '../entities/Node';
import type { Player } from '../entities/Player';
export declare function recoverVoicePlayer(node: Node, player: Player, active: () => boolean, options: {
    label: string;
    destroyReason: string;
    resetReconnectAttempts?: boolean;
}): Promise<'recovered' | 'failed' | 'cancelled' | 'busy'>;
