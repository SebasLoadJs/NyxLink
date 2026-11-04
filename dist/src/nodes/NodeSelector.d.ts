import type { Node } from '../entities/Node';
import type { INodeOptions } from '../typings/Interfaces';
import type { BackendKind } from '../backends/BackendAdapter';
export type NodeRequirements = {
    readonly backend?: BackendKind;
    readonly requiredCapabilities?: readonly string[];
    readonly region?: string;
    readonly regionPolicy?: 'prefer' | 'require';
};
export type NodeSelectionOptions = NodeRequirements & {
    exclude?: readonly string[];
    allowUnhealthyFallback?: boolean;
};
export type NodeRejectionReason = 'unavailable' | 'excluded' | 'not-ready' | 'backend' | 'capability' | 'region' | 'unhealthy';
export type NodeRejection = {
    identifier: string;
    reasons: NodeRejectionReason[];
    missingCapabilities?: string[];
};
export declare class NodeSelector {
    static validate(selection?: NodeSelectionOptions): void;
    private static rejection;
    private static inRegion;
    static matches(node: Node, requirements?: NodeRequirements): boolean;
    static rejections(nodes: Iterable<Node>, options?: INodeOptions, selection?: NodeSelectionOptions): NodeRejection[];
    static select(nodes: Iterable<Node>, options?: INodeOptions, selection?: NodeSelectionOptions): Node | undefined;
}
