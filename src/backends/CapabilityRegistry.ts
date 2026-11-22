/** Distinguishes advertised capabilities, protocol guarantees and endpoint observations. */
export type CapabilityState = 'available' | 'unavailable' | 'unknown';
export type CapabilityEvidence = 'protocol' | 'advertised' | 'observed' | 'none';
export type CapabilityDescription = Readonly<{ feature: string; state: CapabilityState; evidence: CapabilityEvidence }>;
const coreFeatures = ['tracks:load', 'tracks:decode', 'player:update', 'session:resume'] as const;

export class CapabilityRegistry {
    private readonly observations = new Map<string, CapabilityState>();
    constructor(private readonly advertised: ReadonlySet<string>) {}

    public describe(feature: string): CapabilityDescription {
        const observed = this.observations.get(feature);
        if (observed !== undefined) return { feature, state: observed, evidence: 'observed' };
        if (coreFeatures.some(core => core === feature)) return { feature, state: 'available', evidence: 'protocol' };
        if (this.advertised.has(feature)) return { feature, state: 'available', evidence: 'advertised' };
        return { feature, state: 'unknown', evidence: 'none' };
    }

    public record(feature: string, state: CapabilityState): void {
        if (typeof feature !== 'string' || !feature.trim() || !['available', 'unavailable', 'unknown'].includes(state)) {
            throw new TypeError('Invalid capability observation');
        }
        this.observations.set(feature, state);
    }

    /** A detached, deterministic snapshot; mutations cannot alter routing decisions. */
    public list(): CapabilityDescription[] {
        const features = new Set<string>([...coreFeatures, ...this.advertised, ...this.observations.keys()]);
        return [...features].sort().map(feature => this.describe(feature));
    }
}
