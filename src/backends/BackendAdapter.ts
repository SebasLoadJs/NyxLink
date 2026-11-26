import { CapabilityRegistry, type CapabilityDescription, type CapabilityState } from './CapabilityRegistry';
import { nodeLinkPlayerFeatures, preparePlayerUpdate, type PlayerUpdatePayload } from './ProtocolContracts';
import { nodeLinkExtensionFeatures, resolveExtensionRoute, type ExtensionOperation, type ExtensionRouteParameters, type ExtensionRoute } from './ExtensionRoutes';
export type { CapabilityState } from './CapabilityRegistry';
export type BackendKind = 'lavalink' | 'nodelink';
export type BackendPlugin = Readonly<{ name: string; version: string }>;

/** Metadata/capability contract; both backends continue to share the v4 Rest transport. */
export abstract class BackendAdapter {
    public abstract readonly kind: BackendKind;
    public readonly protocolVersion = 4;
    public readonly registry: CapabilityRegistry;
    public readonly plugins: readonly BackendPlugin[];

    constructor(public readonly version: string, public readonly capabilities: Set<string>, plugins: readonly BackendPlugin[] = [], kind?: BackendKind) {
        const native = new Set<string>([
            ...nodeLinkPlayerFeatures, ...nodeLinkExtensionFeatures,
            'nodelink:discovery', 'voiceReceiver', 'youtubeLiveChat',
            'filter:echo', 'filter:chorus', 'filter:compressor', 'filter:highpass', 'filter:phaser', 'filter:spatial'
        ]);
        const pluginsOnly = new Set(['lavasearch', 'lavalyrics', 'lavalyrics:current', 'lavalyrics:subscribe', 'lavalyrics:unsubscribe', 'lavalink:sponsorblock', 'lavadspx', 'lavasrc']);
        const known = new Set([...native, ...pluginsOnly]);
        const unavailable = kind === 'lavalink' ? native : kind === 'nodelink' ? pluginsOnly : new Set<string>();
        this.registry = new CapabilityRegistry(capabilities, known, unavailable);
        this.plugins = Object.freeze(plugins.map(plugin => Object.freeze({ ...plugin })));
    }

    public supports(feature: string): boolean { return this.featureStatus(feature) === 'available'; }
    public featureStatus(feature: string): CapabilityState { return this.registry.describe(feature).state; }
    public describeFeature(feature: string): CapabilityDescription { return this.registry.describe(feature); }
    public listFeatures(): CapabilityDescription[] { return this.registry.list(); }
    public getPlugin(name: string): BackendPlugin | undefined {
        return this.plugins.find(plugin => plugin.name.toLowerCase() === name.toLowerCase());
    }

    public preparePlayerUpdate(payload: PlayerUpdatePayload, channelId?: string): PlayerUpdatePayload {
        return preparePlayerUpdate(this.kind, payload, channelId, feature => this.featureStatus(feature) === 'unavailable');
    }

    public resolveExtension(operation: ExtensionOperation, params?: ExtensionRouteParameters): ExtensionRoute {
        return resolveExtensionRoute(this.kind, operation, params, feature => this.featureStatus(feature) === 'unavailable');
    }

    /** An endpoint response may refine support without guessing from a product name. */
    public recordFeature(feature: string, state: CapabilityState): void { this.registry.record(feature, state); }
}
