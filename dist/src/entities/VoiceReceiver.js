"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceReceiver = void 0;
const Util_1 = require("../Util");
const WebSocket_1 = require("../services/WebSocket");
class VoiceReceiver extends Util_1.EventEmitter {
    node;
    guildId;
    ws;
    reconnectAttempts = 0;
    autoReconnect;
    reconnectDelay;
    maxReconnectAttempts;
    closedByUser = true;
    reconnectTimer;
    owner;
    detachLifecycle = [];
    constructor(node, guildId, options = {}) {
        super();
        if (!node.isNodeLink) {
            throw (0, Util_1.nodeLinkOnlyError)("voiceReceive");
        }
        this.node = node;
        this.guildId = guildId;
        this.autoReconnect = options.autoReconnect ?? true;
        this.reconnectDelay = options.reconnectDelay ?? 5000;
        this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
        if (!Number.isSafeInteger(this.reconnectDelay) || this.reconnectDelay < 0 || this.reconnectDelay > 60000 ||
            !Number.isSafeInteger(this.maxReconnectAttempts) || this.maxReconnectAttempts < 0 || this.maxReconnectAttempts > 100) {
            throw new TypeError("Invalid voice receive reconnect options");
        }
    }
    connect() {
        if (this.ws)
            return this;
        if (!this.node.manager.clientId) {
            throw new Error("Voice receive requires an initialized manager clientId.");
        }
        if (this.node.destroyed || this.node.manager.destroyed || !this.node.isNodeLink) {
            throw new Error("Voice receive requires an active NodeLink node.");
        }
        if (this.reconnectTimer !== undefined)
            clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        if (this.closedByUser) {
            this.owner = this.node.manager.players.get(this.guildId);
            if (this.owner && (this.owner.destroyed || this.owner.node !== this.node))
                throw new Error("Voice receive player is not owned by this node");
            this.reconnectAttempts = 0;
            this.closedByUser = false;
            const manager = this.node.manager;
            this.detachLifecycle = [
                manager.on("nodeDestroy", () => { if (this.node.destroyed)
                    this.close(1000, "Node destroyed"); }),
                manager.on("playerDestroyed", player => { if (player === this.owner)
                    this.close(1000, "Player destroyed"); }),
                manager.on("playerSwitchedNode", player => {
                    if (player === this.owner && player.node !== this.node)
                        this.close(1000, "Player moved");
                }),
            ];
        }
        try {
            this.openSocket();
        }
        catch (error) {
            this.close();
            throw error;
        }
        return this;
    }
    isActive() {
        return !this.closedByUser && !this.node.destroyed && !this.node.manager.destroyed && this.node.isNodeLink &&
            (!this.owner || !this.owner.destroyed && this.owner.node === this.node &&
                this.node.manager.players.get(this.guildId) === this.owner);
    }
    openSocket() {
        if (!this.isActive()) {
            this.close();
            return;
        }
        const protocol = this.node.secure ? "wss" : "ws";
        const url = `${protocol}://${this.node.host}:${this.node.port}/${this.node.pathVersion}/websocket/voice/${this.guildId}`;
        const socket = new WebSocket_1.WebSocket(url, {
            headers: {
                "Authorization": this.node.password,
                "User-Id": this.node.manager.clientId,
                "Client-Name": this.node.manager.options.clientName ?? "NyxLink",
            },
        });
        this.ws = socket;
        this.attachSocket(socket);
    }
    close(code = 1000, reason = "closed") {
        this.closedByUser = true;
        if (this.reconnectTimer !== undefined)
            clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        for (const detach of this.detachLifecycle.splice(0))
            detach();
        this.owner = undefined;
        const socket = this.ws;
        if (socket) {
            try {
                socket.close(code, reason);
            }
            finally {
                if (this.ws === socket)
                    this.ws = undefined;
            }
        }
    }
    attachSocket(socket) {
        const active = () => this.ws === socket && this.isActive();
        socket.on("open", () => {
            if (!active())
                return;
            this.reconnectAttempts = 0;
            this.emit("open");
        });
        socket.on("message", ({ data }) => {
            if (!active() || !Buffer.isBuffer(data))
                return;
            const frame = this.parseFrame(data);
            if (!frame || frame.guildId !== this.guildId)
                return;
            if (frame.op === 1)
                this.emit("start", frame);
            else if (frame.op === 2)
                this.emit("stop", frame);
            else if (frame.op === 3)
                this.emit("data", frame);
        });
        socket.on("error", ({ error }) => {
            if (!active())
                return;
            const err = error instanceof Error ? error : new Error(String(error));
            this.emit("error", err);
        });
        socket.on("close", ({ code, reason }) => {
            if (this.ws !== socket)
                return;
            this.ws = undefined;
            try {
                this.emit("close", code, reason);
            }
            finally {
                if (!this.ws && this.isActive() && this.autoReconnect && code !== 1008)
                    this.scheduleReconnect();
                else if (!this.ws)
                    this.close();
            }
        });
    }
    scheduleReconnect() {
        if (this.reconnectTimer !== undefined || this.ws)
            return;
        if (!this.isActive()) {
            this.close();
            return;
        }
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.close();
            this.emit("error", new Error("Voice receive max reconnect attempts reached."));
            return;
        }
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            if (!this.isActive() || this.ws)
                return;
            try {
                this.openSocket();
            }
            catch (error) {
                this.emit("error", error instanceof Error ? error : new Error(String(error)));
                this.scheduleReconnect();
            }
        }, this.reconnectDelay);
        this.reconnectTimer.unref?.();
    }
    parseFrame(buffer) {
        try {
            if (buffer.length < 12) {
                throw new Error("Voice receive frame too short.");
            }
            const op = buffer.readUInt8(0);
            if (![1, 2, 3].includes(op))
                throw new Error("Invalid voice receive opcode.");
            const formatCode = buffer.readUInt8(1);
            let offset = 2;
            const guildLen = buffer.readUInt8(offset++);
            if (!guildLen || offset + guildLen + 1 > buffer.length)
                throw new Error("Invalid guild field.");
            const guildId = buffer.toString("utf8", offset, offset + guildLen);
            offset += guildLen;
            const userLen = buffer.readUInt8(offset++);
            if (!userLen || offset + userLen + 8 > buffer.length)
                throw new Error("Invalid user field.");
            const userId = buffer.toString("utf8", offset, offset + userLen);
            offset += userLen;
            const ssrc = buffer.readUInt32BE(offset);
            offset += 4;
            const timestamp = buffer.readUInt32BE(offset);
            offset += 4;
            const payload = buffer.slice(offset);
            const format = formatCode === 0 ? "opus" : formatCode === 2 ? "pcm_s16le" : "unknown";
            return { op, format, guildId, userId, ssrc, timestamp, payload };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.emit("error", new Error(`Voice receive parse error: ${message}`));
            return null;
        }
    }
}
exports.VoiceReceiver = VoiceReceiver;
//# sourceMappingURL=VoiceReceiver.js.map