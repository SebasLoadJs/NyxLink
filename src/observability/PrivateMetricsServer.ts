import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Manager } from '../core/Manager';
import { NodeState } from '../typings/types';
import { version } from '../..';

export interface PrivateMetricsOptions {
    /** Secret with at least 32 characters; never store it in source control. */
    token: string;
    /** Loopback only; use an authenticated TLS reverse proxy for remote access. */
    host?: '127.0.0.1' | '::1';
    /** Port 0 chooses a free port. */
    port?: number;
}

export interface PrivateMetricsSnapshot {
    healthy: boolean;
    nodes: { total: number; ready: number; draining: number };
    players: { total: number; playing: number; paused: number };
}

export interface PrivateMetricsNode {
    /** Opaque hash, not a configured hostname, node password or Discord guild ID. */
    key: string;
    backend: string;
    state: string;
    ready: boolean;
    draining: boolean;
    players: number;
    playingPlayers: number;
}

/** An opt-in, read-only, localhost-only diagnostics HTTP service. */
export class PrivateMetricsServer {
    private readonly manager: Manager;
    private readonly expectedToken: Buffer;
    private readonly bindHost: '127.0.0.1' | '::1';
    private readonly bindPort: number;
    private readonly server: Server;
    private listenPromise?: Promise<this>;
    private closed = false;

    constructor(manager: Manager, options: PrivateMetricsOptions) {
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
        this.expectedToken = createHash('sha256').update(options.token).digest();
        this.bindHost = options.host ?? '127.0.0.1';
        this.bindPort = port;
        this.server = createServer((request, response) => this.handle(request, response));
    }

    public get url(): string {
        const address = this.server.address() as AddressInfo | null;
        if (!address) throw new Error('Private metrics server is not listening');
        const hostname = address.family === 'IPv6' ? '[' + address.address + ']' : address.address;
        return 'http://' + hostname + ':' + address.port;
    }

    public listen(): Promise<this> {
        if (this.closed || this.manager.destroyed) {
            return Promise.reject(new Error('Private metrics server is closed'));
        }
        if (this.listenPromise) return this.listenPromise;
        const operation = new Promise<void>((resolve, reject) => {
            const error = (failure: Error) => { this.server.off('listening', ready); reject(failure); };
            const ready = () => { this.server.off('error', error); resolve(); };
            this.server.once('error', error);
            this.server.once('listening', ready);
            this.server.listen(this.bindPort, this.bindHost);
        }).then(() => this);
        this.listenPromise = operation;
        void operation.catch(() => {
            if (this.listenPromise === operation) this.listenPromise = undefined;
        });
        return operation;
    }

    public async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        // A concurrent close must wait for an in-flight bind before releasing it.
        if (this.listenPromise) {
            try { await this.listenPromise; } catch { /* already failed to bind */ }
        }
        if (!this.server.listening) return;
        await new Promise<void>((resolve, reject) =>
            this.server.close(error => error ? reject(error) : resolve()));
    }

    public snapshot(): PrivateMetricsSnapshot {
        let total = 0, ready = 0, draining = 0;
        for (const node of this.manager.nodes.nodes.values()) {
            total++;
            if (node.connected && !node.destroyed && node.state === NodeState.READY) ready++;
            if (node.draining) draining++;
        }
        let players = 0, playing = 0, paused = 0;
        for (const player of this.manager.players.players.values()) {
            if (player.destroyed) continue;
            players++;
            if (player.playing) playing++;
            if (player.paused) paused++;
        }
        return {
            healthy: !this.manager.destroyed,
            nodes: { total, ready, draining },
            players: { total: players, playing, paused },
        };
    }

    private nodeKey(identifier: string): string {
        return createHash('sha256').update(identifier).digest('hex').slice(0, 16);
    }

    private nodeEntries(): PrivateMetricsNode[] {
        const players = [...this.manager.players.players.values()].filter(player => !player.destroyed);
        return [...this.manager.nodes.nodes.values()].map(node => {
            const owned = players.filter(player => player.node === node);
            return {
                key: this.nodeKey(node.identifier),
                backend: node.connected && !node.destroyed ? (node.backend?.kind ?? 'unknown') : 'unknown',
                state: NodeState[node.state] ?? 'unknown',
                ready: node.connected && !node.destroyed && node.state === NodeState.READY,
                draining: node.draining,
                players: owned.length,
                playingPlayers: owned.filter(player => player.playing).length,
            };
        });
    }

    private authorized(request: IncomingMessage): boolean {
        const auth = request.headers.authorization;
        const token = typeof auth === 'string' && auth.startsWith('Bearer ') && auth.length <= 519
            ? auth.slice(7) : '';
        return timingSafeEqual(createHash('sha256').update(token).digest(), this.expectedToken) && token.length > 0;
    }

    private send(response: ServerResponse, status: number, body: string,
        contentType = 'application/json; charset=utf-8'): void {
        response.writeHead(status, {
            'Content-Type': contentType,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'",
            'X-Frame-Options': 'DENY',
        });
        response.end(body);
    }

    private handle(request: IncomingMessage, response: ServerResponse): void {
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
                this.send(response, this.manager.destroyed ? 503 : 200,
                    JSON.stringify({ healthy: !this.manager.destroyed }));
                return;
            case '/nodes':
                this.send(response, 200, JSON.stringify({ nodes: this.nodeEntries() }));
                return;
            case '/players/summary':
                this.send(response, 200, JSON.stringify(this.snapshot().players));
                return;
            case '/versions':
                this.send(response, 200, JSON.stringify({
                    nyxlink: version,
                    nodes: [...this.manager.nodes.nodes.values()].filter(node =>
                        node.connected && !node.destroyed && node.backend).map(node => {
                        const rawVersion = node.backend!.version;
                        return {
                            key: this.nodeKey(node.identifier),
                            backend: node.backend!.kind,
                            version: typeof rawVersion === 'string' && rawVersion.length <= 80 &&
                                /^(?:v)?[0-9]+(?:\.[0-9]+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(rawVersion)
                                ? rawVersion : null,
                        };
                    }),
                }));
                return;
            case '/metrics': {
                const { healthy, nodes, players } = this.snapshot();
                const values: Record<string, number> = {
                    nyxlink_up: Number(healthy),
                    nyxlink_nodes_total: nodes.total,
                    nyxlink_nodes_ready: nodes.ready,
                    nyxlink_nodes_draining: nodes.draining,
                    nyxlink_players_total: players.total,
                    nyxlink_players_playing: players.playing,
                    nyxlink_players_paused: players.paused,
                };
                const body = Object.entries(values).map(([name, value]) =>
                    '# TYPE ' + name + ' gauge\n' + name + ' ' + value + '\n').join('');
                this.send(response, 200, body, 'text/plain; version=0.0.4; charset=utf-8');
                return;
            }
            default:
                this.send(response, 404, JSON.stringify({ error: 'Not found' }));
        }
    }
}
