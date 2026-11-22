import type { BackendKind, BackendPlugin } from './BackendAdapter';
import type { CapabilityDescription } from './CapabilityRegistry';
import type { NodeState } from '../typings/types';

/** Snapshot of current backend metadata; excludes raw info and credentials. */
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
