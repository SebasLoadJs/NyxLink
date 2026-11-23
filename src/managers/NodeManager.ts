import { NodeFailover } from "../nodes/NodeFailover";
import { NodeSelector, type NodeSelectionOptions } from "../nodes/NodeSelector";
import { NodeHealthMonitor } from "../nodes/NodeHealthMonitor";
import type { Manager } from "../core/Manager";
import type { Node } from "../entities/Node";
import type { Player } from "../entities/Player";
import type { BackendInventoryEntry } from "../backends/BackendInventory";
import type { IManagerNodeConfig, INodeStats } from "../typings/Interfaces";
import { NodeState } from "../typings/types";
import { Structure, validate } from "../Util";

export class NodeManager {
    public readonly manager: Manager;
    public readonly nodes: Map<string, Node> = new Map();
    private readonly nodeConfigs: IManagerNodeConfig[];
    private readonly drains = new WeakMap<Node, Promise<boolean>>();
    private readonly ejections = new WeakMap<Node, Promise<boolean>>();

    constructor(manager: Manager, nodeConfigs: IManagerNodeConfig[]) {
        this.manager = manager;
        this.nodeConfigs = nodeConfigs;
    }

    public init(): void {
        for (const config of this.nodeConfigs) {
            if (this.manager.destroyed) return;
            this.add(config);
        }
        
        for (const node of this.nodes.values()) {
            if (this.manager.destroyed) return;
            node.connect();
        }
    }

    public add(config: IManagerNodeConfig): void {
        if (this.manager.destroyed) throw new Error('Manager is shut down');
        this._validateConfig(config);
        const identifier = config.identifier || `${config.host}:${config.port}`;
        if (this.nodes.has(identifier)) {
            throw new Error(`Node with identifier '${identifier}' already exists.`);
        }
        const node = new (Structure.get("Node"))(this.manager, { ...config, identifier });
        this.nodes.set(identifier, node);
        this.manager.emit("nodeCreate", node);
        this.manager.emit("debug", `Moonlink.js > NodeManager#add: Node added. Identifier: ${identifier}`);
    }

    public remove(identifier: string): boolean {
        const node = this.nodes.get(identifier);
        if (!node) return false;
        node.destroy();
        return this.nodes.delete(identifier);
    }

    public get onlineNodes(): Node[] {
        return [...this.nodes.values()].filter(node => NodeHealthMonitor.available(node));
    }

    public get hasOnlineNodes(): boolean {
        return this.onlineNodes.length > 0;
    }

    public get ready(): Node[] {
        return this.onlineNodes.filter(node => node.state === NodeState.READY);
    }

    public get hasReady(): boolean {
        return this.ready.length > 0;
    }

    public get leastUsedNode(): Node | undefined {
        return this.findNode();
    }

    public get stats(): Record<string, INodeStats> {
        const nodeStats: Record<string, INodeStats> = {};
        for (const node of this.onlineNodes) {
            if(node.stats) {
                nodeStats[node.identifier] = node.stats;
            }
        }
        return nodeStats;
    }

    /** Credential-free, detached metadata for monitoring and administrative UIs. */
    public getBackendInventory(): BackendInventoryEntry[] {
        return [...this.nodes.values()].map(node => {
            const connected = NodeHealthMonitor.available(node);
            const adapter = connected ? node.backend : undefined;
            return {
                identifier: node.identifier,
                state: node.state,
                connected,
                ready: connected && node.state === NodeState.READY,
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

    public findNode(options: NodeSelectionOptions = {}): Node | undefined {
        return NodeSelector.select(this.nodes.values(), this.manager.options.node, options);
    }

    public setDraining(identifier: string, draining = true): boolean {
        const node = this.nodes.get(identifier);
        if (typeof draining !== 'boolean') throw new TypeError('draining must be a boolean');
        if (this.manager.destroyed || !node || node.destroyed || !draining && (this.drains.has(node) || this.ejections.has(node))) return false;
        node.draining = draining;
        return true;
    }

    /** Maintenance preserves nodes and players even if some migrations fail. */
    public drain(identifier: string): Promise<boolean> {
        const node = this.nodes.get(identifier);
        if (this.manager.destroyed || !node || node.destroyed) return Promise.resolve(false);
        if (this.ejections.has(node)) return Promise.resolve(false);
        const existing = this.drains.get(node);
        if (existing) return existing;
        this.setDraining(identifier);
        const operation = Promise.resolve().then(() => this.drainPlayers(node)).finally(() => this.drains.delete(node));
        this.drains.set(node, operation);
        return operation;
    }

    private async drainPlayers(node: Node): Promise<boolean> {
        const players = this.manager.players.filter(player => player.node === node);
        let drained = true;
        // Serial evacuation bounds maintenance traffic; the source keeps serving its remaining players.
        for (const player of players) {
            if (this.manager.destroyed || node.destroyed) return false;
            if (player.destroyed || player.node !== node) continue;
            try {
                const result = await NodeFailover.move(player, node);
                const current = !player.destroyed && this.manager.players.get(player.guildId) === player;
                const destination = player.node;
                // Neither a claimed recovery nor an unrelated new command
                // proves evacuation unless the guild has a live, registered owner.
                if (result.status === 'failed' || current && (
                    destination === node || !destination.connected || destination.destroyed ||
                    this.nodes.get(destination.identifier) !== destination
                )) drained = false;
            } catch { drained = false; }
        }
        return drained && !node.destroyed && !this.manager.destroyed &&
            this.nodes.get(node.identifier) === node;
    }

    public eject(identifier: string): Promise<boolean> {
        const node = this.nodes.get(identifier);
        if (!node || node.destroyed || this.manager.destroyed) return Promise.resolve(false);
        const existing = this.ejections.get(node);
        if (existing) return existing;
        if (this.drains.has(node)) return Promise.resolve(false);
        this.setDraining(identifier);
        const operation = Promise.resolve().then(() => this.ejectNode(identifier, node))
            .finally(() => this.ejections.delete(node));
        this.ejections.set(node, operation);
        return operation;
    }

    private async ejectNode(identifier: string, node: Node): Promise<boolean> {
        const active = () => !this.manager.destroyed && !node.destroyed && this.nodes.get(identifier) === node;
        if (!active()) return false;
        const players = this.manager.players.filter(player => player.node === node);
        const results = await Promise.all(players.map(async player => {
            try {
                return await NodeFailover.move(player, node);
            } catch (error) {
                // One rejected guild migration must not abort the entire evacuation.
                const failure = error instanceof Error ? error : new Error(String(error));
                try { this.manager.emit('nodeError', node, failure); } catch { /* observer failure */ }
                return { status: 'failed' as const, attempts: 0 };
            }
        }));
        if (!active()) return false;
        const registered = (player: Player) => !player.destroyed &&
            this.manager.players.get(player.guildId) === player;
        const attached = (player: Player) => registered(player) && player.node === node;
        const stranded = (player: Player) => registered(player) &&
            (!player.node.connected || player.node.destroyed);
        const recovered = (player: Player, index: number) => {
            const result = results[index];
            return result.status === 'recovered' && !!result.node &&
                registered(player) && player.node === result.node &&
                result.node !== node && this.nodes.get(result.node.identifier) === result.node &&
                result.node.connected && !result.node.destroyed;
        };
        // A cancellation on the source represents a newer intent. The node
        // cannot be removed while that command still owns the player.
        if (players.some((player, index) => results[index].status === 'cancelled' && attached(player))) return false;
        // A claimed recovery is not evidence of success if the target is dead,
        // unregistered or no longer owns that guild. Keep those cases visible.
        const failed = players.filter((player, index) => registered(player) &&
            !recovered(player, index) &&
            (attached(player) || stranded(player)));
        if (failed.length) {
            // Orphan notifications are observational: listeners may throw.
            try { this.manager.emit('playersOrphaned', failed, node); }
            catch (error) {
                const failure = error instanceof Error ? error : new Error(String(error));
                try { this.manager.emit('nodeError', node, failure); } catch { /* observer failure */ }
            }
            if (!active()) return false;
            if (!this.manager.options.node?.failover?.preserveOnFailure) {
                // Do not remove a node while any owned guild cleanup is unresolved.
                const cleanup = await Promise.allSettled(failed.filter(registered)
                    .map(player => player.destroy('Node ejected: failover failed')));
                const errors = cleanup.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
                for (const result of errors) {
                    const failure = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
                    try { this.manager.emit('nodeError', node, failure); } catch { /* observer failure */ }
                }
                if (errors.length || failed.some(registered)) return false;
            }
        }
        if (!active()) return false;
        // Do not remove a node that gained a new owner during asynchronous evacuation.
        const preserved = new Set(failed);
        if (this.manager.players.filter(player => attached(player) && !preserved.has(player)).length) return false;
        return this.remove(identifier);
    }

    private _validateConfig(config: IManagerNodeConfig): void {
        validate(config.host, (value) => typeof value === "string" && value.length > 0, "Node config 'host' must be a non-empty string.");
        validate(config.port, (value) => typeof value === "number" && value >= 0 && value <= 65535, "Node config 'port' must be a number between 0 and 65535.");
        validate(config.password, (value) => typeof value === "string", "Node config 'password' must be a string.");
        validate(config.secure, (value) => typeof value === "boolean", "Node config 'secure' must be a boolean.");
    }
}
