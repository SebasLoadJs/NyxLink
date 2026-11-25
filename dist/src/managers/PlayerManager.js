"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerManager = void 0;
const Util_1 = require("../Util");
const NodeSelector_1 = require("../nodes/NodeSelector");
const NoEligibleNodeError_1 = require("../errors/NoEligibleNodeError");
const PlayerSnapshot_1 = require("../database/PlayerSnapshot");
class PlayerManager {
    manager;
    players = new Map();
    constructor(manager) {
        this.manager = manager;
    }
    get all() {
        return [...this.players.values()];
    }
    create(options) {
        return this.createOnNode(options, false);
    }
    restore(options) {
        (0, Util_1.validate)(options.node, value => typeof value === 'string' && value.length > 0, 'Session restoration requires a node identifier');
        return this.createOnNode(options, true);
    }
    createOnNode(options, restoring) {
        if (this.manager.destroyed)
            throw new Error('Manager is shut down');
        (0, Util_1.validate)(options.guildId, (v) => typeof v === "string" && /^\d{17,20}$/.test(v), "IPlayerConfig#guildId must be a valid Discord Snowflake string.");
        (0, Util_1.validate)(options.voiceChannelId, (v) => typeof v === "string" && /^\d{17,20}$/.test(v), "IPlayerConfig#voiceChannelId must be a valid Discord Snowflake string.");
        if (options.textChannelId) {
            (0, Util_1.validate)(options.textChannelId, (v) => typeof v === "string" && /^\d{17,20}$/.test(v), "IPlayerConfig#textChannelId must be a valid Discord Snowflake string.");
        }
        if (options.volume) {
            (0, Util_1.validate)(options.volume, (v) => typeof v === 'number' && v >= 0 && v <= 1000, "IPlayerConfig#volume must be a number between 0 and 1000.");
        }
        if (this.players.has(options.guildId)) {
            this.manager.emit("debug", `Moonlink.js > PlayerManager >> Player already exists for Guild: ${options.guildId}. Returning existing player.`);
            return this.players.get(options.guildId);
        }
        if (options.node !== undefined)
            (0, Util_1.validate)(options.node, value => typeof value === 'string' && value.length > 0, 'IPlayerConfig#node must be a non-empty string');
        if (this.manager.database?.isImportingPlayer(options.guildId))
            throw new PlayerSnapshot_1.SnapshotConflictError();
        const node = options.node !== undefined ? this.manager.nodes.nodes.get(options.node) : this.manager.nodes.findNode(options.nodeSelection);
        if (!node) {
            if (options.node !== undefined)
                throw new NoEligibleNodeError_1.NoEligibleNodeError([{ identifier: options.node, reasons: ['not-found'] }]);
            throw new NoEligibleNodeError_1.NoEligibleNodeError(NodeSelector_1.NodeSelector.rejections(this.manager.nodes.nodes.values(), this.manager.options.node, options.nodeSelection));
        }
        const rejections = NodeSelector_1.NodeSelector.rejections([node], this.manager.options.node, options.nodeSelection);
        const blocking = restoring ? rejections.map(rejection => ({ ...rejection, reasons: rejection.reasons.filter(reason => reason !== 'draining' && reason !== 'circuit-open') })) : rejections;
        if (blocking.some(rejection => rejection.reasons.length > 0))
            throw new NoEligibleNodeError_1.NoEligibleNodeError(blocking);
        const player = new (Util_1.Structure.get("Player"))(this.manager, node, options);
        this.players.set(options.guildId, player);
        player.updateData("guildId", options.guildId);
        player.updateData("voiceChannelId", options.voiceChannelId);
        player.updateData('node', node.identifier);
        if (options.textChannelId)
            player.updateData("textChannelId", options.textChannelId);
        if (options.volume !== undefined)
            player.updateData("volume", options.volume);
        if (options.autoPlay !== undefined)
            player.updateData("autoPlay", options.autoPlay);
        if (options.autoLeave !== undefined)
            player.updateData("autoLeave", options.autoLeave);
        if (options.loop !== undefined)
            player.updateData("loop", options.loop);
        if (options.nodeSelection !== undefined)
            player.updateData('nodeSelection', player.nodeSelection);
        this.manager.emit("playerCreate", player);
        this.manager.emit("debug", `Moonlink.js > PlayerManager >> Player created. Guild: ${options.guildId}, Options: ${JSON.stringify(options)}`);
        return player;
    }
    get(guildId) {
        return this.players.get(guildId);
    }
    has(guildId) {
        return this.players.has(guildId);
    }
    get size() {
        return this.players.size;
    }
    get playingPlayers() {
        return this.all.filter(p => p.playing);
    }
    get idlePlayers() {
        return this.all.filter(p => !p.playing);
    }
    filter(predicate) {
        return this.all.filter(predicate);
    }
    find(predicate) {
        return this.all.find(predicate);
    }
    map(callback) {
        return this.all.map(callback);
    }
    forEach(callback) {
        this.all.forEach(callback);
    }
    async clear() {
        if (this.players.size === 0)
            return;
        await Promise.all([...this.all].map(p => p.destroy("clear")));
    }
    async destroyAll() {
        await this.clear();
    }
    async destroy(guildId, reason) {
        const player = this.get(guildId);
        if (!player) {
            return false;
        }
        await player.destroy(reason ?? "PlayerManager destroy");
        return true;
    }
}
exports.PlayerManager = PlayerManager;
//# sourceMappingURL=PlayerManager.js.map