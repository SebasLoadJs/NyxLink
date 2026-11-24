"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivateMetricsServer = void 0;
const ManagerLogRoute_1 = require("../logging/ManagerLogRoute");
const node_crypto_1 = require("node:crypto");
const node_http_1 = require("node:http");
const types_1 = require("../typings/types");
const __1 = require("../..");
class PrivateMetricsServer {
    manager;
    expectedToken;
    bindHost;
    bindPort;
    server;
    listenPromise;
    closed = false;
    constructor(manager, options) {
        if (!options || typeof options.token !== 'string' ||
            options.token.length < 32 || options.token.length > 512 ||
            /[\r\n]/.test(options.token)) {
            throw new TypeError('Private metrics require a 32..512 character bearer token');
        }
        if (options.host !== undefined && options.host !== '127.0.0.1' && options.host !== '::1') {
            throw new TypeError('Private metrics may bind only to loopback');
        }
        const port = options.port ?? 0;
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
            throw new TypeError('Private metrics port must be 0..65535');
        }
        this.manager = manager;
        this.expectedToken = (0, node_crypto_1.createHash)('sha256').update(options.token).digest();
        this.bindHost = options.host ?? '127.0.0.1';
        this.bindPort = port;
        this.server = (0, node_http_1.createServer)((request, response) => this.handle(request, response));
    }
    get url() {
        const address = this.server.address();
        if (!address)
            throw new Error('Private metrics server is not listening');
        const hostname = address.family === 'IPv6' ? '[' + address.address + ']' : address.address;
        return 'http://' + hostname + ':' + address.port;
    }
    listen() {
        if (this.closed || this.manager.destroyed) {
            return Promise.reject(new Error('Private metrics server is closed'));
        }
        if (this.listenPromise)
            return this.listenPromise;
        const operation = new Promise((resolve, reject) => {
            const error = (failure) => { this.server.off('listening', ready); reject(failure); };
            const ready = () => { this.server.off('error', error); resolve(); };
            this.server.once('error', error);
            this.server.once('listening', ready);
            this.server.listen(this.bindPort, this.bindHost);
        }).then(() => this);
        this.listenPromise = operation;
        void operation.catch(() => {
            if (this.listenPromise === operation)
                this.listenPromise = undefined;
        });
        return operation;
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        if (this.listenPromise) {
            try {
                await this.listenPromise;
            }
            catch { }
        }
        if (!this.server.listening)
            return;
        await new Promise((resolve, reject) => this.server.close(error => error ? reject(error) : resolve()));
    }
    snapshot() {
        let total = 0, ready = 0, draining = 0;
        for (const node of this.manager.nodes.nodes.values()) {
            total++;
            if (node.connected && !node.destroyed && node.state === types_1.NodeState.READY)
                ready++;
            if (node.draining)
                draining++;
        }
        let players = 0, playing = 0, paused = 0;
        for (const player of this.manager.players.players.values()) {
            if (player.destroyed)
                continue;
            players++;
            if (player.playing)
                playing++;
            if (player.paused)
                paused++;
        }
        return {
            healthy: !this.manager.destroyed,
            nodes: { total, ready, draining },
            players: { total: players, playing, paused },
        };
    }
    nodeKey(identifier) {
        return (0, node_crypto_1.createHash)('sha256').update(identifier).digest('hex').slice(0, 16);
    }
    nodeEntries() {
        const players = [...this.manager.players.players.values()].filter(player => !player.destroyed);
        return [...this.manager.nodes.nodes.values()].map(node => {
            const owned = players.filter(player => player.node === node);
            return {
                key: this.nodeKey(node.identifier),
                backend: node.connected && !node.destroyed ? (node.backend?.kind ?? 'unknown') : 'unknown',
                state: types_1.NodeState[node.state] ?? 'unknown',
                ready: node.connected && !node.destroyed && node.state === types_1.NodeState.READY,
                draining: node.draining,
                players: owned.length,
                playingPlayers: owned.filter(player => player.playing).length,
            };
        });
    }
    authorized(request) {
        const auth = request.headers.authorization;
        const token = typeof auth === 'string' && auth.startsWith('Bearer ') && auth.length <= 519
            ? auth.slice(7) : '';
        return (0, node_crypto_1.timingSafeEqual)((0, node_crypto_1.createHash)('sha256').update(token).digest(), this.expectedToken) && token.length > 0;
    }
    send(response, status, body, contentType = 'application/json; charset=utf-8') {
        response.writeHead(status, {
            'Content-Type': contentType,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'",
            'X-Frame-Options': 'DENY',
        });
        response.end(body);
    }
    handle(request, response) {
        if (!this.authorized(request)) {
            response.setHeader('WWW-Authenticate', 'Bearer realm="NyxLink private metrics"');
            this.send(response, 401, JSON.stringify({ error: 'Unauthorized' }));
            return;
        }
        if (request.method !== 'GET') {
            response.setHeader('Allow', 'GET');
            this.send(response, 405, JSON.stringify({ error: 'Method not allowed' }));
            return;
        }
        switch (request.url) {
            case '/health':
                this.send(response, this.manager.destroyed ? 503 : 200, JSON.stringify({ healthy: !this.manager.destroyed }));
                return;
            case '/nodes':
                this.send(response, 200, JSON.stringify({ nodes: this.nodeEntries() }));
                return;
            case '/players/summary':
                this.send(response, 200, JSON.stringify(this.snapshot().players));
                return;
            case '/logging':
                this.send(response, 200, JSON.stringify({ configured: Boolean((0, ManagerLogRoute_1.getManagerLogRoute)(this.manager)), ...(0, ManagerLogRoute_1.getManagerLogRoute)(this.manager)?.getStats() }));
                return;
            case '/performance':
                this.send(response, 200, JSON.stringify({ configured: Boolean(this.manager.performanceMonitor), snapshot: this.manager.performanceMonitor?.snapshot() }));
                return;
            case '/versions':
                this.send(response, 200, JSON.stringify({
                    nyxlink: __1.version,
                    nodes: [...this.manager.nodes.nodes.values()].filter(node => node.connected && !node.destroyed && node.backend).map(node => {
                        const rawVersion = node.backend.version;
                        return {
                            key: this.nodeKey(node.identifier),
                            backend: node.backend.kind,
                            version: typeof rawVersion === 'string' && rawVersion.length <= 80 &&
                                /^(?:v)?[0-9]+(?:\.[0-9]+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(rawVersion)
                                ? rawVersion : null,
                        };
                    }),
                }));
                return;
            case '/metrics': {
                const { healthy, nodes, players } = this.snapshot();
                const values = {
                    nyxlink_up: Number(healthy),
                    nyxlink_nodes_total: nodes.total,
                    nyxlink_nodes_ready: nodes.ready,
                    nyxlink_nodes_draining: nodes.draining,
                    nyxlink_players_total: players.total,
                    nyxlink_players_playing: players.playing,
                    nyxlink_players_paused: players.paused,
                };
                const logging = (0, ManagerLogRoute_1.getManagerLogRoute)(this.manager)?.getStats();
                const counters = logging ? {
                    nyxlink_log_target_accepted_total: logging.accepted,
                    nyxlink_log_filtered_total: logging.filtered,
                    nyxlink_log_target_errors_total: logging.targetErrors,
                    nyxlink_log_critical_target_errors_total: logging.criticalTargetErrors,
                } : {};
                const observed = this.manager.performanceMonitor?.snapshot();
                if (observed) {
                    values.nyxlink_pending_requests = observed.resources.pendingRequests;
                    values.nyxlink_pending_player_commands = observed.resources.pendingPlayerCommands;
                    values.nyxlink_manager_listeners = observed.resources.managerListeners;
                    if (observed.runtime.eventLoopP95Ms !== undefined)
                        values.nyxlink_event_loop_delay_p95_ms = observed.runtime.eventLoopP95Ms;
                    for (const [metric, summary] of Object.entries(observed.durations)) {
                        if (summary.p50Ms !== undefined)
                            values['nyxlink_' + metric + '_p50_ms'] = summary.p50Ms;
                        if (summary.p95Ms !== undefined)
                            values['nyxlink_' + metric + '_p95_ms'] = summary.p95Ms;
                    }
                }
                const body = Object.entries(values).map(([name, value]) => '# TYPE ' + name + ' gauge\n' + name + ' ' + value + '\n').join('');
                const counterBody = Object.entries(counters).map(([name, value]) => '# TYPE ' + name + ' counter\n' + name + ' ' + value + '\n').join('');
                this.send(response, 200, body + counterBody, 'text/plain; version=0.0.4; charset=utf-8');
                return;
            }
            default:
                this.send(response, 404, JSON.stringify({ error: 'Not found' }));
        }
    }
}
exports.PrivateMetricsServer = PrivateMetricsServer;
//# sourceMappingURL=PrivateMetricsServer.js.map