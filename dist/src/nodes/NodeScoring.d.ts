import type { Node } from '../entities/Node';
export type NodeScoreWeights = Partial<Record<'players' | 'cpu' | 'memory' | 'latency' | 'priority', number>>;
export declare function validateScoreWeights(weights: NodeScoreWeights): void;
export declare function weightedNodeScore(node: Node, weights: NodeScoreWeights, maxAgeMs: number, now: number): number;
