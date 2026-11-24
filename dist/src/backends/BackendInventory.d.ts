import type { BackendKind, BackendPlugin } from './BackendAdapter';
import type { CapabilityDescription } from './CapabilityRegistry';
import type { NodeState } from '../typings/types';
export type BackendInventoryEntry = {
    identifier: string;
    state: NodeState;
    connected: boolean;
    ready: boolean;
    draining: boolean;
    kind?: BackendKind;
    version?: string;
    protocolVersion?: number;
    refreshedAt?: number;
    features: CapabilityDescription[];
    plugins: BackendPlugin[];
};
