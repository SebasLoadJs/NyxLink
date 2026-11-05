import type { Node } from '../entities/Node';
import type { INodeOptions } from '../typings/Interfaces';
import { NodeState } from '../typings/types';
import { NodeHealthMonitor } from './NodeHealthMonitor';
import type { BackendKind } from '../backends/BackendAdapter';

/** Hard requirements survive failover; region defaults to a soft preference. */
export type NodeRequirements = {
    readonly backend?: BackendKind;
    readonly requiredCapabilities?: readonly string[];
    readonly region?: string;
    readonly regionPolicy?: 'prefer' | 'require';
};
export type NodeSelectionOptions = NodeRequirements & { exclude?: readonly string[]; allowUnhealthyFallback?: boolean };
export type NodeRejectionReason = 'unavailable' | 'excluded' | 'not-ready' | 'not-found' | 'backend' | 'capability' | 'region' | 'unhealthy' | 'draining' | 'circuit-open';
export type NodeRejection = { identifier: string; reasons: NodeRejectionReason[]; missingCapabilities?: string[] };

const measured = (value: unknown, fallback = Infinity): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

export class NodeSelector {
    public static validate(selection: NodeSelectionOptions = {}): void {
        const strings = (value: unknown): value is readonly string[] => Array.isArray(value) &&
            Array.from(value).every(item => typeof item === 'string' && item.trim().length > 0);
        if (!selection || typeof selection !== 'object' || Array.isArray(selection) ||
            selection.backend !== undefined && !['lavalink', 'nodelink'].includes(selection.backend) ||
            selection.requiredCapabilities !== undefined && !strings(selection.requiredCapabilities) ||
            selection.exclude !== undefined && !strings(selection.exclude) ||
            selection.allowUnhealthyFallback !== undefined && typeof selection.allowUnhealthyFallback !== 'boolean' ||
            selection.region !== undefined && (typeof selection.region !== 'string' || !selection.region.trim()) ||
            selection.regionPolicy !== undefined && !['prefer', 'require'].includes(selection.regionPolicy) ||
            selection.regionPolicy === 'require' && selection.region === undefined) {
            throw new TypeError('Invalid node selection requirements');
        }
    }

    private static rejection(node: Node, selection: NodeSelectionOptions): NodeRejection | undefined {
        const reasons: NodeRejectionReason[] = [];
        if (!NodeHealthMonitor.available(node)) reasons.push('unavailable');
        if (node.draining) reasons.push('draining');
        if (node.circuit && node.circuit.state !== 'closed') reasons.push('circuit-open');
        if (selection.exclude?.includes(node.identifier)) reasons.push('excluded');
        const constrained = selection.backend !== undefined || !!selection.requiredCapabilities?.length || selection.region !== undefined;
        if (constrained && node.state !== NodeState.READY) reasons.push('not-ready');
        if (selection.backend && node.backend?.kind !== selection.backend) reasons.push('backend');
        const missingCapabilities = selection.requiredCapabilities?.filter(feature => !node.backend?.supports(feature)) ?? [];
        if (missingCapabilities.length) reasons.push('capability');
        if (selection.regionPolicy === 'require' && !this.inRegion(node, selection.region!)) reasons.push('region');
        return reasons.length ? { identifier: node.identifier, reasons, ...(missingCapabilities.length ? { missingCapabilities } : {}) } : undefined;
    }

    private static inRegion(node: Node, region: string): boolean {
        return Array.isArray(node.regions) && node.regions.includes(region);
    }

    /** Checks hard constraints and readiness without applying load or soft preferences. */
    public static matches(node: Node, requirements: NodeRequirements = {}): boolean {
        this.validate(requirements);
        return !this.rejection(node, requirements);
    }

    /** Rejection details contain identifiers and reason codes, never node credentials. */
    public static rejections(nodes: Iterable<Node>, options: INodeOptions = {}, selection: NodeSelectionOptions = {}): NodeRejection[] {
        this.validate(selection);
        const rejected: NodeRejection[] = [];
        for (const node of nodes) {
            const rejection = this.rejection(node, selection);
            const unhealthy = selection.allowUnhealthyFallback === false && NodeHealthMonitor.inspect(node, options).state === 'unhealthy';
            if (rejection) {
                if (unhealthy) rejection.reasons.push('unhealthy');
                rejected.push(rejection);
            } else if (unhealthy) rejected.push({ identifier: node.identifier, reasons: ['unhealthy'] });
        }
        return rejected;
    }

    public static select(nodes: Iterable<Node>, options: INodeOptions = {}, selection: NodeSelectionOptions = {}): Node | undefined {
        this.validate(selection);
        let candidates = [...nodes].filter(node => !this.rejection(node, selection));
        if (options.avoidUnhealthyNodes || selection.allowUnhealthyFallback === false) {
            const healthy = candidates.filter(node => NodeHealthMonitor.inspect(node, options).state === 'healthy');
            const unknown = candidates.filter(node => NodeHealthMonitor.inspect(node, options).state === 'unknown');
            if (healthy.length) candidates = healthy;
            else if (unknown.length) candidates = unknown;
            else if (selection.allowUnhealthyFallback === false) candidates = [];
        }
        const ready = candidates.filter(node => node.state === NodeState.READY);
        if (ready.length) candidates = ready;
        if (selection.region && selection.regionPolicy !== 'require') {
            const preferred = candidates.filter(node => this.inRegion(node, selection.region!));
            if (preferred.length) candidates = preferred;
        }
        if (!candidates.length) return undefined;
        const strategy = options.selectionStrategy ?? 'leastLoad';
        if (strategy === 'random') return candidates[Math.floor(Math.random() * candidates.length)];
        const score = (node: Node): number => {
            const stats = node.stats;
            switch (strategy) {
                case 'players': case 'leastPlayers': return measured(stats?.players);
                case 'playingPlayers': return measured(stats?.playingPlayers);
                case 'memory': return measured(stats?.memory?.used);
                case 'cpuLavalink': return measured(stats?.cpu?.lavalinkLoad);
                case 'cpuSystem': return measured(stats?.cpu?.systemLoad);
                case 'uptime': return -measured(stats?.uptime, -Infinity);
                case 'priority': return typeof node.priority === 'number' && Number.isFinite(node.priority) ? node.priority : 0;
                default: return measured(stats?.players) + measured(stats?.cpu?.systemLoad) * 100;
            }
        };
        // Strict comparison preserves insertion order for equal/unknown scores.
        return candidates.reduce((best, node) => score(node) < score(best) ? node : best);
    }
}
