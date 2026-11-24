"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocket = void 0;
const node_crypto_1 = require("node:crypto");
const node_events_1 = require("node:events");
const node_http_1 = __importDefault(require("node:http"));
const node_https_1 = __importDefault(require("node:https"));
const node_url_1 = require("node:url");
const HttpError_1 = require("../errors/HttpError");
const isBun = typeof process !== "undefined" && process.versions?.bun;
class WebSocket extends node_events_1.EventEmitter {
    url;
    headers;
    socket = null;
    netSocket;
    connected = false;
    closeNotified = false;
    buffer = Buffer.alloc(0);
    fragmentedPayload = [];
    fragmentedOpCode = null;
    fragmentedBytes = 0;
    MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
    redirectCount = 0;
    MAX_REDIRECTS = 5;
    pingInterval = null;
    heartbeatTimeout;
    heartbeatKey;
    pingSequence = 0;
    pendingPings = new Map();
    PING_INTERVAL = 30000;
    PONG_TIMEOUT = 5000;
    pingTimestamps = new Map();
    latency = 0;
    constructor(url, options) {
        super();
        this.url = new node_url_1.URL(url);
        if (!["ws:", "wss:"].includes(this.url.protocol) || this.url.username || this.url.password) {
            throw new TypeError("Invalid WebSocket URL");
        }
        this.headers = { ...options?.headers };
        this.redirectCount = 0;
        if (isBun) {
            this.connectBun();
        }
        else {
            this.connectNode();
        }
    }
    connectBun() {
        const ws = new globalThis.WebSocket(this.url.toString(), {
            headers: this.headers,
        });
        ws.addEventListener("open", () => {
            this.connected = true;
            return this.emit("open");
        });
        ws.addEventListener("message", (msg) => { return this.emit("message", { data: msg.data }); });
        ws.addEventListener("close", (ev) => {
            this.connected = false;
            return this.emit("close", { code: ev.code, reason: ev.reason });
        });
        ws.addEventListener("error", (err) => { return this.emit("error", { error: err }); });
        this.socket = ws;
    }
    connectNode() {
        const key = (0, node_crypto_1.randomBytes)(16).toString("base64");
        const protocol = this.url.protocol === "wss:" ? node_https_1.default : node_http_1.default;
        const port = this.url.port || (this.url.protocol === "wss:" ? 443 : 80);
        const baseHeaders = {
            "Connection": "Upgrade",
            "Upgrade": "websocket",
            "Sec-WebSocket-Version": "13",
            "Sec-WebSocket-Key": key,
        };
        const allowedExtraHeaders = ["authorization", "user-id", "client-name", "session-id"];
        for (const [header, value] of Object.entries(this.headers)) {
            if (allowedExtraHeaders.includes(header.toLowerCase())) {
                baseHeaders[header] = value;
            }
        }
        const options = {
            port,
            host: this.url.hostname,
            headers: baseHeaders,
            path: this.url.pathname + this.url.search,
            timeout: 10000,
        };
        const request = protocol.request(options);
        this.socket = request;
        const active = () => !this.closeNotified && this.socket === request;
        request.on("response", (res) => {
            if (!active()) {
                res.destroy();
                return;
            }
            const { statusCode, headers } = res;
            if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) {
                let target;
                try {
                    if (this.redirectCount >= this.MAX_REDIRECTS || !headers.location)
                        throw new Error("Invalid WebSocket redirect");
                    target = new node_url_1.URL(headers.location, this.url);
                    if (target.origin !== this.url.origin || target.username || target.password) {
                        throw new Error("WebSocket redirect changes origin or credentials");
                    }
                }
                catch (error) {
                    res.destroy();
                    this.failConnection(error, 1006, "Rejected WebSocket redirect");
                    return;
                }
                this.socket = null;
                res.destroy();
                request.destroy();
                this.redirectCount++;
                this.url = target;
                this.connectNode();
                return;
            }
            if (statusCode !== 101) {
                res.destroy();
                this.failConnection(new HttpError_1.HttpError(statusCode ?? 0), statusCode === 401 || statusCode === 403 ? 1008 : 1006, `HTTP ${statusCode}`);
                switch (statusCode) {
                    case 401:
                        this.emit("debug", "Authentication failed, please check your credentials.");
                        break;
                    case 404:
                        this.emit("debug", "Service unavailable, check your host and port.");
                        break;
                    default:
                        this.emit("debug", `Unexpected status code: ${statusCode}`);
                }
            }
        });
        request.on("upgrade", (res, socket, head) => {
            if (!active()) {
                socket.destroy();
                return;
            }
            const expectedKey = (0, node_crypto_1.createHash)("sha1")
                .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
                .digest("base64");
            if (res.headers["sec-websocket-accept"] !== expectedKey) {
                socket.destroy();
                this.failConnection(new Error("Invalid Sec-WebSocket-Accept header"), 1002, "Invalid handshake");
                return;
            }
            this.redirectCount = 0;
            this.netSocket = socket;
            this.connected = true;
            this.buffer = head;
            this.emit("open");
            if (this.closeNotified || !this.connected || !this.netSocket)
                return;
            this.startHeartbeat();
            this.netSocket.on("data", (data) => { return this.handleData(data); });
            this.netSocket.on("close", () => {
                this.stopHeartbeat();
                return this.handleClose(1006, "Connection closed abruptly");
            });
            this.netSocket.on("error", (err) => { if (!this.closeNotified)
                this.failConnection(err, 1006, "Transport error"); });
            this.processBuffer();
        });
        request.on("error", (err) => {
            if (active())
                this.failConnection(err, 1006, "Connection failed");
        });
        request.on("timeout", () => {
            if (active() && !this.connected)
                this.failConnection(new Error("Connection timed out"), 1006, "Connection timed out");
        });
        request.end();
    }
    failConnection(error, code, reason) {
        try {
            this.emit("error", { error });
        }
        finally {
            this.handleClose(code, reason);
        }
    }
    nextPingPayload() {
        let payload;
        do {
            payload = Buffer.from(`nyx:${++this.pingSequence}`);
        } while (this.pingTimestamps.has(payload.toString('hex')));
        return payload;
    }
    startHeartbeat() {
        this.stopHeartbeat();
        this.pingInterval = setInterval(() => {
            if (!this.connected || !this.netSocket) {
                this.stopHeartbeat();
                return;
            }
            const payload = this.nextPingPayload();
            this.heartbeatKey = payload.toString('hex');
            this.pingTimestamps.set(this.heartbeatKey, Date.now());
            this.heartbeatTimeout = setTimeout(() => {
                this.heartbeatTimeout = undefined;
                if (this.connected) {
                    this.emit('error', { error: new Error('No pong received') });
                    this.close(1000, 'Pong timeout');
                }
            }, this.PONG_TIMEOUT);
            try {
                this.sendFrame(0x9, payload);
            }
            catch (error) {
                this.emit('error', { error });
                this.close(1000, 'Heartbeat write failed');
            }
        }, this.PING_INTERVAL);
    }
    stopHeartbeat() {
        if (this.pingInterval)
            clearInterval(this.pingInterval);
        this.pingInterval = null;
        if (this.heartbeatTimeout)
            clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = undefined;
        if (this.heartbeatKey)
            this.pingTimestamps.delete(this.heartbeatKey);
        this.heartbeatKey = undefined;
    }
    ping(data) {
        if (isBun)
            return Promise.reject(new Error('Manual ping not supported in Bun mode'));
        if (!this.connected || !this.netSocket)
            return Promise.reject(new Error('WebSocket is not connected'));
        const payload = data === undefined ? this.nextPingPayload() : Buffer.isBuffer(data) ? data : Buffer.from(data);
        const key = payload.toString('hex');
        if (payload.length > 125)
            return Promise.reject(new RangeError('Ping payload must be at most 125 bytes'));
        if (this.pingTimestamps.has(key))
            return Promise.reject(new Error('A ping with this payload is already pending'));
        return new Promise((resolve, reject) => {
            this.pingTimestamps.set(key, Date.now());
            const timeout = setTimeout(() => {
                this.pingTimestamps.delete(key);
                this.pendingPings.delete(key);
                reject(new Error('Pong timeout'));
            }, this.PONG_TIMEOUT);
            this.pendingPings.set(key, { timeout, resolve, reject });
            try {
                this.sendFrame(0x9, payload);
            }
            catch (error) {
                clearTimeout(timeout);
                this.pendingPings.delete(key);
                this.pingTimestamps.delete(key);
                reject(error);
            }
        });
    }
    handleData(data) {
        if (this.closeNotified)
            return;
        this.buffer = Buffer.concat([this.buffer, data]);
        this.processBuffer();
    }
    processBuffer() {
        while (!this.closeNotified && this.buffer.length >= 2) {
            const firstByte = this.buffer[0];
            const secondByte = this.buffer[1];
            const fin = (firstByte & 0x80) !== 0;
            const opcode = firstByte & 0x0f;
            const masked = (secondByte & 0x80) !== 0;
            let payloadLength = secondByte & 0x7f;
            let offset = 2;
            if (payloadLength === 126) {
                if (this.buffer.length < 4)
                    return;
                payloadLength = this.buffer.readUInt16BE(2);
                offset = 4;
            }
            else if (payloadLength === 127) {
                if (this.buffer.length < 10)
                    return;
                payloadLength = Number(this.buffer.readBigUInt64BE(2));
                offset = 10;
            }
            if (payloadLength > this.MAX_MESSAGE_BYTES) {
                this.close(1009, "Frame too large");
                return;
            }
            const maskingKeyOffset = offset;
            const payloadOffset = maskingKeyOffset + (masked ? 4 : 0);
            const totalLength = payloadOffset + payloadLength;
            if (this.buffer.length < totalLength)
                return;
            let payload = this.buffer.slice(payloadOffset, totalLength);
            if (masked) {
                const maskingKey = this.buffer.slice(maskingKeyOffset, payloadOffset);
                for (let i = 0; i < payload.length; i++) {
                    payload[i] ^= maskingKey[i % 4];
                }
            }
            this.buffer = this.buffer.slice(totalLength);
            this.handleFrame(opcode, fin, payload);
        }
    }
    handleFrame(opcode, fin, payload) {
        switch (opcode) {
            case 0x0:
            case 0x1:
            case 0x2:
                if (opcode !== 0x0 && this.fragmentedOpCode !== null) {
                    this.emit("error", { error: new Error("Unexpected new data frame during fragmentation") });
                    this.close(1002, "Unexpected data frame");
                    return;
                }
                if (opcode === 0x0 && this.fragmentedOpCode === null) {
                    this.close(1002, "Unexpected continuation");
                    return;
                }
                if (this.fragmentedBytes + payload.length > this.MAX_MESSAGE_BYTES) {
                    this.close(1009, "Message too large");
                    return;
                }
                if (opcode !== 0x0)
                    this.fragmentedOpCode = opcode;
                this.fragmentedBytes += payload.length;
                this.fragmentedPayload.push(payload);
                if (fin) {
                    const message = Buffer.concat(this.fragmentedPayload);
                    const messageData = this.fragmentedOpCode === 0x1 ? message.toString() : message;
                    this.fragmentedPayload = [];
                    this.fragmentedOpCode = null;
                    this.fragmentedBytes = 0;
                    this.emit("message", { data: messageData });
                }
                break;
            case 0x8:
                const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
                const reason = payload.length > 2 ? payload.slice(2).toString() : "";
                this.handleClose(code, reason);
                break;
            case 0x9:
                this.sendFrame(0xa, payload);
                this.emit("ping", payload);
                break;
            case 0xa: {
                const key = payload.toString('hex');
                const sentAt = this.pingTimestamps.get(key);
                if (sentAt !== undefined) {
                    this.latency = Date.now() - sentAt;
                    this.pingTimestamps.delete(key);
                    if (this.heartbeatKey === key) {
                        if (this.heartbeatTimeout)
                            clearTimeout(this.heartbeatTimeout);
                        this.heartbeatTimeout = undefined;
                        this.heartbeatKey = undefined;
                    }
                    const pending = this.pendingPings.get(key);
                    if (pending) {
                        clearTimeout(pending.timeout);
                        this.pendingPings.delete(key);
                        pending.resolve(this.latency);
                    }
                    this.emit('pong', this.latency);
                }
                else
                    this.emit('pong');
                break;
            }
            default:
                this.emit("error", { error: new Error(`Unsupported opcode: ${opcode}`) });
                this.close(1002, "Unsupported opcode");
        }
    }
    handleClose(code, reason) {
        if (this.closeNotified)
            return;
        this.closeNotified = true;
        this.connected = false;
        this.stopHeartbeat();
        this.pingTimestamps.clear();
        for (const pending of this.pendingPings.values()) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('WebSocket closed before pong'));
        }
        this.pendingPings.clear();
        this.buffer = Buffer.alloc(0);
        this.fragmentedPayload = [];
        this.fragmentedOpCode = null;
        this.fragmentedBytes = 0;
        const network = this.netSocket;
        const request = this.socket;
        this.netSocket = null;
        this.socket = null;
        network?.destroy();
        request?.destroy();
        this.emit("close", { code, reason });
    }
    send(data) {
        if (isBun) {
            if (this.socket?.readyState === this.socket.OPEN) {
                this.socket.send(data);
            }
            return;
        }
        if (!this.connected || !this.netSocket) {
            throw new Error("WebSocket is not connected");
        }
        const opcode = typeof data === "string" ? 0x1 : 0x2;
        const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
        this.sendFrame(opcode, payload);
    }
    sendFrame(opcode, payload) {
        if (!this.netSocket || !this.connected)
            return;
        const payloadLength = payload.length;
        const maskingKey = (0, node_crypto_1.randomBytes)(4);
        const maskedPayload = Buffer.alloc(payloadLength);
        for (let i = 0; i < payloadLength; i++) {
            maskedPayload[i] = payload[i] ^ maskingKey[i % 4];
        }
        let header;
        let headerLength = 2;
        if (payloadLength < 126) {
            header = Buffer.alloc(headerLength + 4);
            header[1] = 0x80 | payloadLength;
        }
        else if (payloadLength < 65536) {
            headerLength = 4;
            header = Buffer.alloc(headerLength + 4);
            header[1] = 0x80 | 126;
            header.writeUInt16BE(payloadLength, 2);
        }
        else {
            headerLength = 10;
            header = Buffer.alloc(headerLength + 4);
            header[1] = 0x80 | 127;
            header.writeBigUInt64BE(BigInt(payloadLength), 2);
        }
        header[0] = 0x80 | opcode;
        maskingKey.copy(header, headerLength);
        this.netSocket.write(Buffer.concat([header, maskedPayload]));
    }
    close(code = 1000, reason = "") {
        if (isBun) {
            this.socket?.close(code, reason);
            return;
        }
        if (!this.connected || !this.netSocket) {
            this.handleClose(code, reason);
            return;
        }
        const reasonBuffer = Buffer.from(reason);
        const payload = Buffer.alloc(2 + reasonBuffer.length);
        payload.writeUInt16BE(code, 0);
        reasonBuffer.copy(payload, 2);
        try {
            this.sendFrame(0x8, payload);
        }
        catch { }
        finally {
            this.handleClose(code, reason);
        }
    }
    get readyState() {
        if (isBun) {
            return this.socket?.readyState ?? 3;
        }
        return this.connected ? 1 : 3;
    }
}
exports.WebSocket = WebSocket;
//# sourceMappingURL=WebSocket.js.map