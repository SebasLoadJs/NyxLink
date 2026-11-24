"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeManager = void 0;
const OpenTelemetry_1 = require("../observability/OpenTelemetry");
const NodeFailover_1 = require("../nodes/NodeFailover");
const NodeSelector_1 = require("../nodes/NodeSelector");
const NodeHealthMonitor_1 = require("../nodes/NodeHealthMonitor");
const types_1 = require("../typings/types");
const Util_1 = require("../Util");
class NodeManager {
    manager;
    nodes = new Map();
    nodeConfigs;
    drains = new WeakMap();
    ejections = new WeakMap();
    constructor(manager, nodeConfigs) {
        this.manager = manager;
        this.nodeConfigs = nodeConfigs;
    }
    init() {
        for (const config of this.nodeConfigs) {
            if (this.manager.destroyed)
                return;
            this.add(config);
        }
        for (const node of this.nodes.values()) {
            if (this.manager.destroyed)
                return;
            node.connect();
        }
    }
    add(config) {
        if (this.manager.destroyed)
            throw new Error('Manager is shut down');
        this._validateConfig(config);
        const identifier = config.identifier || `${config.host}:${config.port}`;
        if (this.nodes.has(identifier)) {
            throw new Error(`Node with identifier '${identifier}' already exists.`);
        }
        const node = new (Util_1.Structure.get("Node"))(this.manager, { ...config, identifier });
        this.nodes.set(identifier, node);
        this.manager.emit("nodeCreate", node);
        this.manager.emit("debug", `Moonlink.js > NodeManager#add: Node added. Identifier: ${identifier}`);
    }
    remove(identifier) {
        const node = this.nodes.get(identifier);
        if (!node)
            return false;
        node.destroy();
        return this.nodes.delete(identifier);
    }
    get onlineNodes() {
        return [...this.nodes.values()].filter(node => NodeHealthMonitor_1.NodeHealthMonitor.available(node));
    }
    get hasOnlineNodes() {
        return this.onlineNodes.length > 0;
    }
    get ready() {
        return this.onlineNodes.filter(node => node.state === types_1.NodeState.READY);
    }
    get hasReady() {
        return this.ready.length > 0;
    }
    get leastUsedNode() {
        return this.findNode();
    }
    get stats() {
        const nodeStats = {};
        for (const node of this.onlineNodes) {
            if (node.stats) {
                nodeStats[node.identifier] = node.stats;
            }
        }
        return nodeStats;
    }
    getBackendInventory() {
        return [...this.nodes.values()].map(node => {
            const connected = NodeHealthMonitor_1.NodeHealthMonitor.available(node);
            const adapter = connected ? node.backend : undefined;
            return {
                identifier: node.identifier,
                state: node.state,
                connected,
                ready: connected && node.state === types_1.NodeState.READY,
                draining: node.draining,
                kind: adapter?.kind,
                version: adapter?.version,
                protocolVersion: adapter?.protocolVersion,
                refreshedAt: adapter ? node.backendRefreshedAt : undefined,
                features: adapter?.listFeatures() ?? [],
                plugins: adapter?.plugins.map(plugin => ({ ...plugin })) ?? [],
            };
        });
    }
    findNode(options = {}) {
        return (0, OpenTelemetry_1.observeSyncOperation)(this.manager, 'nyxlink.node.select', () => NodeSelector_1.NodeSelector.select(this.nodes.values(), this.manager.options.node, options), result => result ? 'success' : 'empty');
    }
    setDraining(identifier, draining = true) {
        const node = this.nodes.get(identifier);
        if (typeof draining !== 'boolean')
            throw new TypeError('draining must be a boolean');
        if (this.manager.destroyed || !node || node.destroyed || !draining && (this.drains.has(node) || this.ejections.has(node)))
            return false;
        node.draining = draining;
        return true;
    }
    drain(identifier) {
        const node = this.nodes.get(identifier);
        if (this.manager.destroyed || !node || node.destroyed)
            return Promise.resolve(false);
        if (this.ejections.has(node))
            return Promise.resolve(false);
        const existing = this.drains.get(node);
        if (existing)
            return existing;
        this.setDraining(identifier);
        const operation = Promise.resolve().then(() => this.drainPlayers(node)).finally(() => this.drains.delete(node));
        this.drains.set(node, operation);
        return operation;
    }
    async drainPlayers(node) {
        const players = this.manager.players.filter(player => player.node === node);
        let drained = true;
        for (const player of players) {
            if (this.manager.destroyed || node.destroyed)
                return false;
            if (player.destroyed || player.node !== node)
                continue;
            try {
                const result = await NodeFailover_1.NodeFailover.move(player, node);
                const current = !player.destroyed && this.manager.players.get(player.guildId) === player;
                const destination = player.node;
                if (result.status === 'failed' || current && (destination === node || !destination.connected || destination.destroyed ||
                    this.nodes.get(destination.identifier) !== destination))
                    drained = false;
            }
            catch {
                drained = false;
            }
        }
        return drained && !node.destroyed && !this.manager.destroyed &&
            this.nodes.get(node.identifier) === node;
    }
    eject(identifier) {
        const node = this.nodes.get(identifier);
        if (!node || node.destroyed || this.manager.destroyed)
            return Promise.resolve(false);
        const existing = this.ejections.get(node);
        if (existing)
            return existing;
        if (this.drains.has(node))
            return Promise.resolve(false);
        this.setDraining(identifier);
        const operation = Promise.resolve().then(() => this.ejectNode(identifier, node))
            .finally(() => this.ejections.delete(node));
        this.ejections.set(node, operation);
        return operation;
    }
    async ejectNode(identifier, node) {
        const active = () => !this.manager.destroyed && !node.destroyed && this.nodes.get(identifier) === node;
        if (!active())
            return false;
        const players = this.manager.players.filter(player => player.node === node);
        const results = await Promise.all(players.map(async (player) => {
            try {
                return await NodeFailover_1.NodeFailover.move(player, node);
            }
            catch (error) {
                const failure = error instanceof Error ? error : new Error(String(error));
                try {
                    this.manager.emit('nodeError', node, failure);
                }
                catch { }
                return { status: 'failed', attempts: 0 };
            }
        }));
        if (!active())
            return false;
        const registered = (player) => !player.destroyed &&
            this.manager.players.get(player.guildId) === player;
        const attached = (player) => registered(player) && player.node === node;
        const stranded = (player) => registered(player) &&
            (!player.node.connected || player.node.destroyed);
        const recovered = (player, index) => {
            const result = results[index];
            return result.status === 'recovered' && !!result.node &&
                registered(player) && player.node === result.node &&
                result.node !== node && this.nodes.get(result.node.identifier) === result.node &&
                result.node.connected && !result.node.destroyed;
        };
        if (players.some((player, index) => results[index].status === 'cancelled' && registered(player)))
            return false;
        if (players.some((player, index) => results[index].status === 'recovered' &&
            registered(player) && !recovered(player, index) &&
            !attached(player) && !stranded(player)))
            return false;
        const failed = players.filter((player, index) => registered(player) &&
            !recovered(player, index) &&
            (attached(player) || stranded(player)));
        if (failed.length) {
            try {
                this.manager.emit('playersOrphaned', failed, node);
            }
            catch (error) {
                const failure = error instanceof Error ? error : new Error(String(error));
                try {
                    this.manager.emit('nodeError', node, failure);
                }
                catch { }
            }
            if (!active())
                return false;
            if (!this.manager.options.node?.failover?.preserveOnFailure) {
                const cleanup = await Promise.allSettled(failed.filter(registered)
                    .map(player => player.destroy('Node ejected: failover failed')));
                const errors = cleanup.filter((result) => result.status === 'rejected');
                for (const result of errors) {
                    const failure = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
                    try {
                        this.manager.emit('nodeError', node, failure);
                    }
                    catch { }
                }
                if (errors.length || failed.some(registered))
                    return false;
            }
        }
        if (!active())
            return false;
        const preserved = new Set(failed);
        if (this.manager.players.filter(player => attached(player) && !preserved.has(player)).length)
            return false;
        return this.remove(identifier);
    }
    _validateConfig(config) {
        (0, Util_1.validate)(config.host, (value) => typeof value === "string" && value.length > 0, "Node config 'host' must be a non-empty string.");
        (0, Util_1.validate)(config.port, (value) => typeof value === "number" && value >= 0 && value <= 65535, "Node config 'port' must be a number between 0 and 65535.");
        (0, Util_1.validate)(config.password, (value) => typeof value === "string", "Node config 'password' must be a string.");
        (0, Util_1.validate)(config.secure, (value) => typeof value === "boolean", "Node config 'secure' must be a boolean.");
    }
}
exports.NodeManager = NodeManager;
//# sourceMappingURL=NodeManager.js.map