import type { NodeRejection } from '../nodes/NodeSelector';

export class NoEligibleNodeError extends Error {
    public readonly code = 'NO_ELIGIBLE_NODE';

    constructor(public readonly rejections: NodeRejection[]) {
        super('NyxLink > PlayerManager#create: No eligible nodes.');
        this.name = 'NoEligibleNodeError';
    }
}
