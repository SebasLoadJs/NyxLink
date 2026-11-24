export type CapabilityState = 'available' | 'unavailable' | 'unknown';
export type CapabilityEvidence = 'protocol' | 'advertised' | 'observed' | 'none';
export type CapabilityDescription = Readonly<{
    feature: string;
    state: CapabilityState;
    evidence: CapabilityEvidence;
}>;
export declare class CapabilityRegistry {
    private readonly advertised;
    private readonly observations;
    constructor(advertised: ReadonlySet<string>);
    describe(feature: string): CapabilityDescription;
    record(feature: string, state: CapabilityState): void;
    list(): CapabilityDescription[];
}
