"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeSelector = void 0;
const types_1 = require("../typings/types");
const NodeHealthMonitor_1 = require("./NodeHealthMonitor");
const NodeScoring_1 = require("./NodeScoring");
const measured = (value, fallback = Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
class NodeSelector {
    static validate(selection = {}) {
        const strings = (value) => Array.isArray(value) &&
            Array.from(value).every(item => typeof item === 'string' && item.trim().length > 0);
        if (!selection || typeof selection !== 'object' || Array.isArray(selection) ||
            selection.preferredNode !== undefined && (typeof selection.preferredNode !== 'string' || !selection.preferredNode.trim()) ||
            selection.minimumScoreImprovement !== undefined && (!Number.isFinite(selection.minimumScoreImprovement) || selection.minimumScoreImprovement < 0 || !selection.preferredNode) ||
            selection.backend !== undefined && !['lavalink', 'nodelink'].includes(selection.backend) ||
            selection.requiredCapabilities !== undefined && !strings(selection.requiredCapabilities) ||
            selection.exclude !== undefined && !strings(selection.exclude) ||
            selection.allowUnhealthyFallback !== undefined && typeof selection.allowUnhealthyFallback !== 'boolean' ||
            selection.region !== undefined && (typeof selection.region !== 'string' || !selection.region.trim()) ||
            selection.regionPolicy !== undefined && !['prefer', 'require'].includes(selection.regionPolicy) ||
            selection.regionPolicy === 'require' && selection.region === undefined ||
            selection.preferSource !== undefined && (typeof selection.preferSource !== 'string' || !/^[\w.-]+$/.test(selection.preferSource)) ||
            selection.sourceHealthMaxAgeMs !== undefined && (!Number.isSafeInteger(selection.sourceHealthMaxAgeMs) || selection.sourceHealthMaxAgeMs < 1 || selection.sourceHealthMaxAgeMs > 3600000)) {
            throw new TypeError('Invalid node selection requirements');
        }
        if (selection.scoreWeights !== undefined)
            (0, NodeScoring_1.validateScoreWeights)(selection.scoreWeights);
    }
    static rejection(node, selection) {
        const reasons = [];
        if (!NodeHealthMonitor_1.NodeHealthMonitor.available(node))
            reasons.push('unavailable');
        if (node.draining)
            reasons.push('draining');
        if (node.circuit && node.circuit.state !== 'closed')
            reasons.push('circuit-open');
        if (selection.exclude?.includes(node.identifier))
            reasons.push('excluded');
        const constrained = selection.backend !== undefined || !!selection.requiredCapabilities?.length || selection.region !== undefined;
        if (constrained && node.state !== types_1.NodeState.READY)
            reasons.push('not-ready');
        if (selection.backend && node.backend?.kind !== selection.backend)
            reasons.push('backend');
        const missingCapabilities = selection.requiredCapabilities?.filter(feature => !node.backend?.supports(feature)) ?? [];
        if (missingCapabilities.length)
            reasons.push('capability');
        if (selection.regionPolicy === 'require' && !this.inRegion(node, selection.region))
            reasons.push('region');
        return reasons.length ? { identifier: node.identifier, reasons, ...(missingCapabilities.length ? { missingCapabilities } : {}) } : undefined;
    }
    static inRegion(node, region) {
        return Array.isArray(node.regions) && node.regions.includes(region);
    }
    static matches(node, requirements = {}) {
        this.validate(requirements);
        return !this.rejection(node, requirements);
    }
    static rejections(nodes, options = {}, selection = {}) {
        this.validate(selection);
        const rejected = [];
        for (const node of nodes) {
            const rejection = this.rejection(node, selection);
            const unhealthy = selection.allowUnhealthyFallback === false && NodeHealthMonitor_1.NodeHealthMonitor.inspect(node, options).state === 'unhealthy';
            if (rejection) {
                if (unhealthy)
                    rejection.reasons.push('unhealthy');
                rejected.push(rejection);
            }
            else if (unhealthy)
                rejected.push({ identifier: node.identifier, reasons: ['unhealthy'] });
        }
        return rejected;
    }
    static select(nodes, options = {}, selection = {}) {
        this.validate(selection);
        let candidates = [...nodes].filter(node => !this.rejection(node, selection));
        if (options.avoidUnhealthyNodes || selection.allowUnhealthyFallback === false) {
            const healthy = candidates.filter(node => NodeHealthMonitor_1.NodeHealthMonitor.inspect(node, options).state === 'healthy');
            const unknown = candidates.filter(node => NodeHealthMonitor_1.NodeHealthMonitor.inspect(node, options).state === 'unknown');
            if (healthy.length)
                candidates = healthy;
            else if (unknown.length)
                candidates = unknown;
            else if (selection.allowUnhealthyFallback === false)
                candidates = [];
        }
        const ready = candidates.filter(node => node.state === types_1.NodeState.READY);
        if (ready.length)
            candidates = ready;
        if (selection.region && selection.regionPolicy !== 'require') {
            const preferred = candidates.filter(node => this.inRegion(node, selection.region));
            if (preferred.length)
                candidates = preferred;
        }
        if (!candidates.length)
            return undefined;
        if (selection.preferSource) {
            const source = selection.preferSource;
            const now = Date.now();
            const maxAge = selection.sourceHealthMaxAgeMs ?? 120000;
            const rank = (node) => {
                const entry = node.sourceHealth?.get(source);
                if (!entry || entry.receivedAt > now || now - entry.receivedAt > maxAge)
                    return 1;
                if (entry.health.circuitBreaker === 'OPEN')
                    return 3;
                switch (entry.health.status) {
                    case 'healthy': return 0;
                    case 'degraded': return 2;
                    case 'unavailable':
                    case 'rate_limited':
                    case 'restricted':
                    case 'misconfigured': return 3;
                    default: return 1;
                }
            };
            const ranks = candidates.map(node => rank(node));
            const best = ranks.reduce((a, b) => Math.min(a, b), Infinity);
            candidates = candidates.filter((_node, index) => ranks[index] === best);
        }
        const strategy = options.selectionStrategy ?? 'leastLoad';
        if (strategy === 'random' && !selection.scoreWeights)
            return candidates[Math.floor(Math.random() * candidates.length)];
        const now = Date.now();
        const score = (node) => {
            if (selection.scoreWeights)
                return (0, NodeScoring_1.weightedNodeScore)(node, selection.scoreWeights, options.maxStatsAgeMs ?? 120000, now);
            const stats = node.stats;
            switch (strategy) {
                case 'players':
                case 'leastPlayers': return measured(stats?.players);
                case 'playingPlayers': return measured(stats?.playingPlayers);
                case 'memory': return measured(stats?.memory?.used);
                case 'cpuLavalink': return measured(stats?.cpu?.lavalinkLoad);
                case 'cpuSystem': return measured(stats?.cpu?.systemLoad);
                case 'uptime': return -measured(stats?.uptime, -Infinity);
                case 'priority': return typeof node.priority === 'number' && Number.isFinite(node.priority) ? node.priority : 0;
                default: return measured(stats?.players) + measured(stats?.cpu?.systemLoad) * 100;
            }
        };
        const costs = new Map(candidates.map(node => [node, score(node)]));
        const best = candidates.reduce((best, node) => costs.get(node) < costs.get(best) ? node : best);
        const preferred = candidates.find(node => node.identifier === selection.preferredNode);
        if (preferred && Number.isFinite(costs.get(preferred)) &&
            costs.get(preferred) - costs.get(best) <= (selection.minimumScoreImprovement ?? 0))
            return preferred;
        return best;
    }
}
exports.NodeSelector = NodeSelector;
//# sourceMappingURL=NodeSelector.js.map