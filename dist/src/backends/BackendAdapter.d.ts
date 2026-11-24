import { CapabilityRegistry, type CapabilityDescription, type CapabilityState } from './CapabilityRegistry';
import { type PlayerUpdatePayload } from './ProtocolContracts';
import { type ExtensionOperation, type ExtensionRouteParameters, type ExtensionRoute } from './ExtensionRoutes';
export type { CapabilityState } from './CapabilityRegistry';
export type BackendKind = 'lavalink' | 'nodelink';
export type BackendPlugin = Readonly<{
    name: string;
    version: string;
}>;
export declare abstract class BackendAdapter {
    readonly version: string;
    readonly capabilities: Set<string>;
    abstract readonly kind: BackendKind;
    readonly protocolVersion = 4;
    readonly registry: CapabilityRegistry;
    readonly plugins: readonly BackendPlugin[];
    constructor(version: string, capabilities: Set<string>, plugins?: readonly BackendPlugin[]);
    supports(feature: string): boolean;
    featureStatus(feature: string): CapabilityState;
    describeFeature(feature: string): CapabilityDescription;
    listFeatures(): CapabilityDescription[];
    getPlugin(name: string): BackendPlugin | undefined;
    preparePlayerUpdate(payload: PlayerUpdatePayload, channelId?: string): PlayerUpdatePayload;
    resolveExtension(operation: ExtensionOperation, params?: ExtensionRouteParameters): ExtensionRoute;
    recordFeature(feature: string, state: CapabilityState): void;
}
