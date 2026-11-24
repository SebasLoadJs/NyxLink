"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilityRegistry = void 0;
const coreFeatures = ['tracks:load', 'tracks:decode', 'player:update', 'session:resume'];
class CapabilityRegistry {
    advertised;
    observations = new Map();
    constructor(advertised) {
        this.advertised = advertised;
    }
    describe(feature) {
        const observed = this.observations.get(feature);
        if (observed !== undefined)
            return { feature, state: observed, evidence: 'observed' };
        if (coreFeatures.some(core => core === feature))
            return { feature, state: 'available', evidence: 'protocol' };
        if (this.advertised.has(feature))
            return { feature, state: 'available', evidence: 'advertised' };
        return { feature, state: 'unknown', evidence: 'none' };
    }
    record(feature, state) {
        if (typeof feature !== 'string' || !feature.trim() || !['available', 'unavailable', 'unknown'].includes(state)) {
            throw new TypeError('Invalid capability observation');
        }
        this.observations.set(feature, state);
    }
    list() {
        const features = new Set([...coreFeatures, ...this.advertised, ...this.observations.keys()]);
        return [...features].sort().map(feature => this.describe(feature));
    }
}
exports.CapabilityRegistry = CapabilityRegistry;
//# sourceMappingURL=CapabilityRegistry.js.map