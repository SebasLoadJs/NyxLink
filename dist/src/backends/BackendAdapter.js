"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendAdapter = void 0;
const CapabilityRegistry_1 = require("./CapabilityRegistry");
const ProtocolContracts_1 = require("./ProtocolContracts");
const ExtensionRoutes_1 = require("./ExtensionRoutes");
class BackendAdapter {
    version;
    capabilities;
    protocolVersion = 4;
    registry;
    plugins;
    constructor(version, capabilities, plugins = []) {
        this.version = version;
        this.capabilities = capabilities;
        this.registry = new CapabilityRegistry_1.CapabilityRegistry(capabilities);
        this.plugins = Object.freeze(plugins.map(plugin => Object.freeze({ ...plugin })));
    }
    supports(feature) { return this.featureStatus(feature) === 'available'; }
    featureStatus(feature) { return this.registry.describe(feature).state; }
    describeFeature(feature) { return this.registry.describe(feature); }
    listFeatures() { return this.registry.list(); }
    getPlugin(name) {
        return this.plugins.find(plugin => plugin.name.toLowerCase() === name.toLowerCase());
    }
    preparePlayerUpdate(payload, channelId) {
        return (0, ProtocolContracts_1.preparePlayerUpdate)(this.kind, payload, channelId, feature => this.featureStatus(feature) === 'unavailable');
    }
    resolveExtension(operation, params) {
        return (0, ExtensionRoutes_1.resolveExtensionRoute)(this.kind, operation, params, feature => this.featureStatus(feature) === 'unavailable');
    }
    recordFeature(feature, state) { this.registry.record(feature, state); }
}
exports.BackendAdapter = BackendAdapter;
//# sourceMappingURL=BackendAdapter.js.map