"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeSelector = void 0;
const types_1 = require("../typings/types");
const NodeHealthMonitor_1 = require("./NodeHealthMonitor");
const measured = (value, fallback = Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
class NodeSelector {
    static validate(selection = {}) {
        const strings = (value) => Array.isArray(value) &&
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
        const strategy = options.selectionStrategy ?? 'leastLoad';
        if (strategy === 'random')
            return candidates[Math.floor(Math.random() * candidates.length)];
        const score = (node) => {
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
        return candidates.reduce((best, node) => score(node) < score(best) ? node : best);
    }
}
exports.NodeSelector = NodeSelector;
//# sourceMappingURL=NodeSelector.js.map