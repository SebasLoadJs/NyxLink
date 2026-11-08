import { Manager } from "../core/Manager";
import { Node } from "../entities/Node";
import { Player } from "../entities/Player";
import { Structure, validate, delay } from "../Util";
import { IPlayerConfig } from "../typings/Interfaces";
import { NodeSelector } from '../nodes/NodeSelector';
import { NoEligibleNodeError } from '../errors/NoEligibleNodeError';
import { SnapshotConflictError } from '../database/PlayerSnapshot';

export class PlayerManager {
    public readonly manager: Manager;
    public readonly players: Map<string, Player> = new Map();

    constructor(manager: Manager) {
        this.manager = manager;
    }

    public get all(): Player[] {
        return [...this.players.values()];
    }

    public create(options: IPlayerConfig): Player {
        return this.createOnNode(options, false);
    }

    /** @internal Adopt an existing server session without treating maintenance as new assignment. */
    public restore(options: IPlayerConfig): Player {
        validate(options.node, value => typeof value === 'string' && value.length > 0, 'Session restoration requires a node identifier');
        return this.createOnNode(options, true);
    }

    private createOnNode(options: IPlayerConfig, restoring: boolean): Player {
        if (this.manager.destroyed) throw new Error('Manager is shut down');
        validate(options.guildId, (v) => typeof v === "string" && /^\d{17,20}$/.test(v), "IPlayerConfig#guildId must be a valid Discord Snowflake string.");
        validate(options.voiceChannelId, (v) => typeof v === "string" && /^\d{17,20}$/.test(v), "IPlayerConfig#voiceChannelId must be a valid Discord Snowflake string.");
        if (options.textChannelId) {
            validate(options.textChannelId, (v) => typeof v === "string" && /^\d{17,20}$/.test(v), "IPlayerConfig#textChannelId must be a valid Discord Snowflake string.");
        }
        if (options.volume) {
            validate(options.volume, (v) => typeof v === 'number' && v >= 0 && v <= 1000, "IPlayerConfig#volume must be a number between 0 and 1000.");
        }

        if (this.players.has(options.guildId)) {
            this.manager.emit("debug", `Moonlink.js > PlayerManager >> Player already exists for Guild: ${options.guildId}. Returning existing player.`);
            return this.players.get(options.guildId)!;
        }

        if (options.node !== undefined) validate(options.node, value => typeof value === 'string' && value.length > 0, 'IPlayerConfig#node must be a non-empty string');
        if (this.manager.database?.isImportingPlayer(options.guildId)) throw new SnapshotConflictError();
        const node = options.node !== undefined ? this.manager.nodes.nodes.get(options.node) : this.manager.nodes.findNode(options.nodeSelection);
        if (!node) {
            if (options.node !== undefined) throw new NoEligibleNodeError([{ identifier: options.node, reasons: ['not-found'] }]);
            throw new NoEligibleNodeError(NodeSelector.rejections(this.manager.nodes.nodes.values(), this.manager.options.node, options.nodeSelection));
        }
        const rejections = NodeSelector.rejections([node], this.manager.options.node, options.nodeSelection);
        const blocking = restoring ? rejections.map(rejection => ({ ...rejection, reasons: rejection.reasons.filter(reason => reason !== 'draining' && reason !== 'circuit-open') })) : rejections;
        if (blocking.some(rejection => rejection.reasons.length > 0)) throw new NoEligibleNodeError(blocking);

        const player = new (Structure.get("Player"))(this.manager, node, options);
        this.players.set(options.guildId, player);
        
        // Update basic config fields individually to avoid overwriting existing data (like queue)
        player.updateData("guildId", options.guildId);
        player.updateData("voiceChannelId", options.voiceChannelId);
        player.updateData('node', node.identifier);
        if (options.textChannelId) player.updateData("textChannelId", options.textChannelId);
        if (options.volume !== undefined) player.updateData("volume", options.volume);
        if (options.autoPlay !== undefined) player.updateData("autoPlay", options.autoPlay);
        if (options.autoLeave !== undefined) player.updateData("autoLeave", options.autoLeave);
        if (options.loop !== undefined) player.updateData("loop", options.loop);
        if (options.nodeSelection !== undefined) player.updateData('nodeSelection', player.nodeSelection);

        this.manager.emit("playerCreate", player);
        this.manager.emit("debug", `Moonlink.js > PlayerManager >> Player created. Guild: ${options.guildId}, Options: ${JSON.stringify(options)}`);
        return player;
    }

    public get(guildId: string): Player | undefined {
        return this.players.get(guildId);
    }

    public has(guildId: string): boolean {
        return this.players.has(guildId);
    }

    public get size(): number {
        return this.players.size;
    }

    public get playingPlayers(): Player[] {
        return this.all.filter(p => p.playing);
    }

    public get idlePlayers(): Player[] {
        return this.all.filter(p => !p.playing);
    }

    public filter(predicate: (player: Player) => boolean): Player[] {
        return this.all.filter(predicate);
    }

    public find(predicate: (player: Player) => boolean): Player | undefined {
        return this.all.find(predicate);
    }

    public map<T>(callback: (player: Player) => T): T[] {
        return this.all.map(callback);
    }

    public forEach(callback: (player: Player) => void): void {
        this.all.forEach(callback);
    }

    public async clear(): Promise<void> {
        if (this.players.size === 0) return;
        await Promise.all([...this.all].map(p => p.destroy("clear")));
    }

    public async destroyAll(): Promise<void> {
        await this.clear();
    }

    public async destroy(guildId: string, reason?: string): Promise<boolean> {
        const player = this.get(guildId);
        if (!player) {
            return false;
        }
        await player.destroy(reason ?? "PlayerManager destroy");
        return true;
    }

    }
