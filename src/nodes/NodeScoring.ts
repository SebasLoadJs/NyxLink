import type { Node } from '../entities/Node';

/** Costs use players, CPU/memory ratios, milliseconds and configured priority respectively. */
export type NodeScoreWeights = Partial<Record<'players' | 'cpu' | 'memory' | 'latency' | 'priority', number>>;
const keys = ['players', 'cpu', 'memory', 'latency', 'priority'] as const;

export function validateScoreWeights(weights: NodeScoreWeights): void {
    if (!weights || typeof weights !== 'object' || Array.isArray(weights) ||
        Object.keys(weights).some(key => !keys.includes(key as typeof keys[number])) ||
        !Object.values(weights).some(value => typeof value === 'number' && value > 0) ||
        Object.values(weights).some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000)) {
        throw new TypeError('Invalid node score weights');
    }
}

/** No timers, network probes, retained nodes or inferred measurements. */
export function weightedNodeScore(node: Node, weights: NodeScoreWeights, maxAgeMs: number, now: number): number {
    let cost = 0;
    for (const key of keys) {
        const weight = weights[key] ?? 0;
        if (!weight) continue;
        if (['players', 'cpu', 'memory'].includes(key) &&
            (node.statsReceivedAt === undefined || !Number.isFinite(node.statsReceivedAt) ||
                node.statsReceivedAt > now || now - node.statsReceivedAt > maxAgeMs)) return Infinity;
        const stats = node.stats;
        let value: number | undefined;
        switch (key) {
            case 'players': value = stats?.players; break;
            case 'cpu': value = stats?.cpu?.systemLoad; break;
            case 'memory': {
                const memory = stats?.memory;
                value = memory && Number.isFinite(memory.allocated) && memory.allocated > 0 &&
                    Number.isFinite(memory.used) && memory.used >= 0 ? memory.used / memory.allocated : undefined;
                break;
            }
            case 'latency': value = node.latency; break;
            case 'priority': value = node.priority ?? 0; break;
        }
        if (typeof value !== 'number' || !Number.isFinite(value) || key !== 'priority' && value < 0) return Infinity;
        cost += value * weight;
    }
    return Number.isFinite(cost) ? cost : Infinity;
}
