import { EventEmitter, nodeLinkOnlyError } from "../Util";
import { WebSocket } from "../services/WebSocket";
import type { Node } from "./Node";

export type YouTubeLiveChatAuthor = {
    name?: string;
    id?: string;
    avatar?: string;
    isOwner?: boolean;
    isModerator?: boolean;
    isVerified?: boolean;
};

export type YouTubeLiveChatMessage = {
    type: "message";
    author?: YouTubeLiveChatAuthor;
    content?: string;
    timestamp?: number;
};

export type YouTubeLiveChatAction = {
    type: "action";
    action?: string;
    author?: YouTubeLiveChatAuthor;
    amount?: string;
    content?: string;
    timestamp?: number;
};

export type YouTubeLiveChatPayload = YouTubeLiveChatMessage | YouTubeLiveChatAction | Record<string, any>;

export interface YouTubeLiveChatOptions {
    autoReconnect?: boolean;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
}

interface YouTubeLiveChatEvents {
    open: () => void;
    close: (code: number, reason: string) => void;
    error: (error: Error) => void;
    message: (payload: YouTubeLiveChatMessage) => void;
    action: (payload: YouTubeLiveChatAction) => void;
    raw: (payload: YouTubeLiveChatPayload) => void;
}

export class YouTubeLiveChat extends EventEmitter<YouTubeLiveChatEvents> {
    private readonly node: Node;
    public readonly identifier: string;
    private ws?: WebSocket;
    private reconnectAttempts = 0;
    private readonly autoReconnect: boolean;
    private readonly reconnectDelay: number;
    private readonly maxReconnectAttempts: number;
    private closedByUser = false;
    private reconnectTimer?: ReturnType<typeof setTimeout>;

    constructor(node: Node, identifier: string, options: YouTubeLiveChatOptions = {}) {
        super();
        if (!node.isNodeLink) {
            throw nodeLinkOnlyError("youtubeLiveChat");
        }
        if (typeof identifier !== "string" || !identifier.trim()) {
            throw new TypeError("YouTube live chat identifier must be a non-empty string");
        }
        if (options.autoReconnect !== undefined && typeof options.autoReconnect !== "boolean") {
            throw new TypeError("YouTube live chat autoReconnect must be a boolean");
        }
        const reconnectDelay = options.reconnectDelay ?? 5000;
        const maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
        if (!Number.isInteger(reconnectDelay) || reconnectDelay < 0 || reconnectDelay > 300000 ||
            !Number.isInteger(maxReconnectAttempts) || maxReconnectAttempts < 0 || maxReconnectAttempts > 20) {
            throw new TypeError("Invalid YouTube live chat reconnect limits");
        }
        this.node = node;
        this.identifier = identifier;
        this.autoReconnect = options.autoReconnect ?? true;
        this.reconnectDelay = reconnectDelay;
        this.maxReconnectAttempts = maxReconnectAttempts;
    }

    /** NodeLink-only feature. See https://github.com/PerformanC/NodeLink */
    public connect(): this {
        if (!this.node.manager.clientId) {
            throw new Error("YouTube live chat requires an initialized manager clientId.");
        }
        if (this.node.destroyed || this.node.manager.destroyed) {
            throw new Error("Cannot connect live chat after node or manager destruction.");
        }
        if (this.ws && !this.closedByUser) return this;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.closedByUser = false;
        const protocol = this.node.secure ? "wss" : "ws";
        const encodedId = encodeURIComponent(this.identifier);
        const url = `${protocol}://${this.node.host}:${this.node.port}/${this.node.pathVersion}/websocket/youtube/live/${encodedId}`;
        this.ws = new WebSocket(url, {
            headers: {
                "Authorization": this.node.password,
                "User-Id": this.node.manager.clientId,
                "Client-Name": this.node.manager.options.clientName ?? "NyxLink",
            },
        });
        this.attachSocket(this.ws);
        return this;
    }

    public close(code: number = 1000, reason: string = "closed"): void {
        this.closedByUser = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.ws?.close(code, reason);
    }

    private attachSocket(socket: WebSocket): void {
        socket.on("open", () => {
            if (this.ws !== socket || this.closedByUser) return;
            this.reconnectAttempts = 0;
            this.emit("open");
        });

        socket.on("message", ({ data }) => {
            if (this.ws !== socket || this.closedByUser) return;
            const text = typeof data === "string" ? data : data.toString("utf8");
            if (!text) return;
            let payload: YouTubeLiveChatPayload;
            try {
                payload = JSON.parse(text);
            } catch {
                // JSON parser diagnostics can embed untrusted message contents.
                this.emit("error", new Error("YouTube live chat parse error: invalid JSON payload"));
                return;
            }

            this.emit("raw", payload);
            if (payload && (payload as YouTubeLiveChatMessage).type === "message") {
                this.emit("message", payload as YouTubeLiveChatMessage);
            } else if (payload && (payload as YouTubeLiveChatAction).type === "action") {
                this.emit("action", payload as YouTubeLiveChatAction);
            }
        });

        socket.on("error", ({ error }) => {
            if (this.ws !== socket || this.closedByUser) return;
            const err = error instanceof Error ? error : new Error(String(error));
            this.emit("error", err);
        });

        socket.on("close", ({ code, reason }) => {
            if (this.ws !== socket) return;
            this.ws = undefined;
            this.emit("close", code, reason);
            if (!this.closedByUser && !this.ws && this.autoReconnect) {
                this.scheduleReconnect();
            }
        });
    }

    private scheduleReconnect(): void {
        if (this.closedByUser || this.reconnectTimer || this.node.destroyed || this.node.manager.destroyed) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit("error", new Error("YouTube live chat max reconnect attempts reached."));
            return;
        }
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            if (this.closedByUser || this.ws || this.node.destroyed || this.node.manager.destroyed) return;
            try { this.connect(); }
            catch (error) {
                this.emit("error", error instanceof Error ? error : new Error(String(error)));
            }
        }, this.reconnectDelay);
        this.reconnectTimer.unref?.();
    }
}
