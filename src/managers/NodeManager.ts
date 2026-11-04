import { NodeFailover } from "../nodes/NodeFailover";
import { NodeSelector, type NodeSelectionOptions } from "../nodes/NodeSelector";
import { NodeHealthMonitor } from "../nodes/NodeHealthMonitor";
import { Manager } from "../core/Manager";
import { IManagerNodeConfig } from "../typings/Interfaces";
import { NodeSortStrategy, NodeState } from "../typings/types";
import { Structure, validate, generateUUID } from "../Util";

export class NodeManager {
    public readonly manager: Manager;
    public readonly nodes: Map<string, any> = new Map();
    private readonly nodeConfigs: IManagerNodeConfig[];
    private readonly drains = new WeakMap<object, Promise<boolean>>();

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

    public get onlineNodes(): any[] {
        return [...this.nodes.values()].filter(node => NodeHealthMonitor.available(node));
    }

    public get hasOnlineNodes(): boolean {
        return this.onlineNodes.length > 0;
    }

    public get ready(): any[] {
        return this.onlineNodes.filter(node => node.state === NodeState.READY);
    }

    public get hasReady(): boolean {
        return this.ready.length > 0;
    }

    public get leastUsedNode(): any | undefined {
        return this.findNode();
    }

    public get stats(): Record<string, any> {
        const nodeStats: Record<string, any> = {};
        for (const node of this.onlineNodes) {
            if(node.stats) {
                nodeStats[node.identifier] = node.stats;
            }
        }
        return nodeStats;
    }

    public findNode(options: NodeSelectionOptions = {}): any | undefined {
        return NodeSelector.select(this.nodes.values(), this.manager.options.node, options);
    }

    public setDraining(identifier: string, draining = true): boolean {
        const node = this.nodes.get(identifier);
        if (typeof draining !== 'boolean') throw new TypeError('draining must be a boolean');
        if (this.manager.destroyed || !node || node.destroyed || !draining && this.drains.has(node)) return false;
        node.draining = draining;
        return true;
    }

    /** Maintenance preserves nodes and players even if some migrations fail. */
    public drain(identifier: string): Promise<boolean> {
        const node = this.nodes.get(identifier);
        if (this.manager.destroyed || !node || node.destroyed) return Promise.resolve(false);
        const existing = this.drains.get(node);
        if (existing) return existing;
        this.setDraining(identifier);
        const operation = Promise.resolve().then(() => this.drainPlayers(node)).finally(() => this.drains.delete(node));
        this.drains.set(node, operation);
        return operation;
    }

    private async drainPlayers(node: any): Promise<boolean> {
        const players = this.manager.players.filter(player => player.node === node);
        let drained = true;
        // Serial evacuation bounds maintenance traffic; the source keeps serving its remaining players.
        for (const player of players) {
            if (this.manager.destroyed || node.destroyed) return false;
            if (player.destroyed || player.node !== node) continue;
            try {
                const result = await NodeFailover.move(player, node);
                if (result.status !== 'recovered' && !player.destroyed && player.node === node) drained = false;
                else if (result.status === 'failed') drained = false;
            } catch { drained = false; }
        }
        return drained && !node.destroyed && !this.manager.destroyed;
    }

    public async eject(identifier: string): Promise<boolean> {
        const node = this.nodes.get(identifier);
        if (!node) {
            this.manager.emit("debug", `Moonlink.js > NodeManager#eject: Node ${identifier} not found.`);
            return false;
        }

        const playersToMove = this.manager.players.filter(player => player.node.identifier === identifier);
        
        if (playersToMove.length > 0) {
            this.manager.emit("debug", `Moonlink.js > NodeManager#eject: Moving ${playersToMove.length} players from ${identifier}...`);
            const results = await Promise.all(playersToMove.map(player => NodeFailover.move(player, node)));
            const failed = playersToMove.filter((_, index) => results[index].status === 'failed');
            if (failed.length) {
                this.manager.emit('playersOrphaned', failed, node);
                if (!this.manager.options.node?.failover?.preserveOnFailure) {
                    await Promise.all(failed.map(player => player.destroy('Node ejected: failover failed')));
                }
            }
        }

        this.remove(identifier);
        this.manager.emit("debug", `Moonlink.js > NodeManager#eject: Node ${identifier} ejected successfully.`);
        return true;
    }

    private _validateConfig(config: IManagerNodeConfig): void {
        validate(config.host, (value) => typeof value === "string" && value.length > 0, "Node config 'host' must be a non-empty string.");
        validate(config.port, (value) => typeof value === "number" && value >= 0 && value <= 65535, "Node config 'port' must be a number between 0 and 65535.");
        validate(config.password, (value) => typeof value === "string", "Node config 'password' must be a string.");
        validate(config.secure, (value) => typeof value === "boolean", "Node config 'secure' must be a boolean.");
    }
}
