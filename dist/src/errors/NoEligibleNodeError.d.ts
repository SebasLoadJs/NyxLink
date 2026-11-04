import type { NodeRejection } from '../nodes/NodeSelector';
export declare class NoEligibleNodeError extends Error {
    readonly rejections: NodeRejection[];
    readonly code = "NO_ELIGIBLE_NODE";
    constructor(rejections: NodeRejection[]);
}
