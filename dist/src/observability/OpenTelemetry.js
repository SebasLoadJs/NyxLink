"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenTelemetry = void 0;
exports.observeOperation = observeOperation;
exports.observeSyncOperation = observeSyncOperation;
const node_perf_hooks_1 = require("node:perf_hooks");
const types_1 = require("../typings/types");
const operationNames = ['nyxlink.rest', 'nyxlink.player.play', 'nyxlink.player.seek', 'nyxlink.player.stop', 'nyxlink.failover', 'nyxlink.connect', 'nyxlink.resolve', 'nyxlink.node.select', 'nyxlink.session.restore', 'nyxlink.autoplay', 'nyxlink.crossfade', 'nyxlink.capabilities'];
const validOperations = new Set(operationNames);
const validOutcomes = new Set(['success', 'empty', 'error', 'cancelled', 'resolved']);
const installed = new WeakMap();
function observeOperation(manager, name, operation, classify) {
    const telemetry = installed.get(manager);
    return telemetry ? telemetry.operation(name, operation, classify) : operation();
}
function observeSyncOperation(manager, name, operation, classify) {
    const telemetry = installed.get(manager);
    return telemetry ? telemetry.syncOperation(name, operation, classify) : operation();
}
class OpenTelemetry {
    options;
    counter;
    duration;
    operationsDuration;
    handshakes = new Map();
    disposers = [];
    closed = false;
    constructor(manager, options) {
        this.options = options;
        this.counter = this.safe(() => options.meter?.createCounter('nyxlink.events'));
        this.duration = this.safe(() => options.meter?.createHistogram('nyxlink.search.duration', { unit: 'ms' }));
        this.operationsDuration = this.safe(() => options.meter?.createHistogram('nyxlink.operation.duration', { unit: 'ms' }));
        this.gauge('nyxlink.nodes.connected', () => [...manager.nodes.nodes.values()].filter(node => node.connected && !node.destroyed).length);
        this.gauge('nyxlink.players.active', () => manager.players.all.filter(player => !player.destroyed && player.playing && !player.paused).length);
        installed.set(manager, this);
        this.disposers.push(() => { if (installed.get(manager) === this)
            installed.delete(manager); });
        this.disposers.push(manager.on('nodeStateChange', (node, _old, state) => {
            if (state === types_1.NodeState.CONNECTING && !this.handshakes.has(node)) {
                this.handshakes.set(node, { start: node_perf_hooks_1.performance.now(), span: this.safe(() => options.tracer?.startSpan('nyxlink.handshake')) });
            }
            else if (state === types_1.NodeState.READY)
                this.finishHandshake(node, 'success');
            else if (state === types_1.NodeState.DISCONNECTED)
                this.finishHandshake(node, 'error');
            else if (state === types_1.NodeState.DESTROYED)
                this.finishHandshake(node, 'cancelled');
        }), manager.on('nodeReady', node => this.event('node.ready', this.backend(node.backend?.kind))), manager.on('nodeError', node => this.event('node.error', this.backend(node.backend?.kind))), manager.on('nodeDisconnect', node => this.event('node.disconnect', this.backend(node.backend?.kind))), manager.on('nodeReconnecting', node => this.event('node.reconnecting', this.backend(node.backend?.kind))), manager.on('nodeResume', node => this.event('node.resume', this.backend(node.backend?.kind))), manager.on('playerResumed', player => this.event('player.resumed', this.backend(player.node.backend?.kind))), manager.on('trackEnd', (player, _track, reason) => {
            if (reason === 'crossfading' || reason === 'gapless')
                this.event('track.transition.' + reason, this.backend(player.node.backend?.kind));
        }), manager.on('trackStart', player => this.event('track.start', this.backend(player.node.backend?.kind))), manager.on('trackException', player => this.event('track.error', this.backend(player.node.backend?.kind))), manager.on('queueEnd', player => this.event('queue.end', this.backend(player.node.backend?.kind))), manager.on('playerNodeFailover', (player, report) => {
            const status = report.status;
            if (status === 'in-progress' || status === 'recovered' || status === 'failed' || status === 'cancelled') {
                this.event('failover.' + status, this.backend(player.node.backend?.kind));
            }
        }));
    }
    finishHandshake(node, outcome) {
        const pending = this.handshakes.get(node);
        if (!pending)
            return;
        this.handshakes.delete(node);
        this.safe(() => pending.span?.setAttribute('nyxlink.outcome', outcome));
        this.safe(() => pending.span?.setStatus({ code: outcome === 'error' ? 2 : 0 }));
        this.safe(() => pending.span?.end());
        this.safe(() => this.operationsDuration?.record(node_perf_hooks_1.performance.now() - pending.start, { operation: 'nyxlink.handshake', outcome }));
    }
    safe(action) {
        try {
            return action();
        }
        catch {
            return undefined;
        }
    }
    gauge(name, value) {
        const gauge = this.safe(() => this.options.meter?.createObservableGauge?.(name, { unit: '1' }));
        if (!gauge)
            return;
        const callback = (result) => {
            if (!this.closed)
                this.safe(() => result.observe(value()));
        };
        this.safe(() => gauge.addCallback(callback));
        this.disposers.push(() => gauge.removeCallback(callback));
    }
    backend(value) {
        return value === 'lavalink' || value === 'nodelink' ? value : 'unknown';
    }
    event(name, backend) {
        if (!this.closed)
            this.safe(() => this.counter?.add(1, { event: name, backend }));
    }
    run(name, operation, classify) {
        if (this.closed)
            return operation();
        const start = node_perf_hooks_1.performance.now();
        let invoked;
        const execute = (span) => {
            if (invoked)
                return invoked;
            invoked = (async () => {
                let outcome = 'error';
                try {
                    const result = await operation();
                    const observed = this.safe(() => classify(result));
                    outcome = observed && validOutcomes.has(observed) ? observed : 'resolved';
                    return result;
                }
                catch (error) {
                    if (error instanceof Error && error.name === 'AbortError')
                        outcome = 'cancelled';
                    throw error;
                }
                finally {
                    this.safe(() => span?.setAttribute('nyxlink.outcome', outcome));
                    this.safe(() => span?.setStatus({ code: outcome === 'error' ? 2 : 0 }));
                    this.safe(() => span?.end());
                    if (!this.closed) {
                        const elapsed = node_perf_hooks_1.performance.now() - start;
                        if (name === 'nyxlink.search') {
                            this.safe(() => this.duration?.record(elapsed, { outcome }));
                            this.event('search.' + outcome, 'unknown');
                        }
                        else {
                            this.safe(() => this.operationsDuration?.record(elapsed, { operation: name, outcome }));
                            this.event('operation.' + name.slice(8) + '.' + outcome, 'unknown');
                        }
                    }
                }
            })();
            return invoked;
        };
        if (this.options.tracer?.startActiveSpan) {
            try {
                this.options.tracer.startActiveSpan(name, execute);
            }
            catch { }
            if (invoked)
                return invoked;
        }
        return execute(this.safe(() => this.options.tracer?.startSpan(name)));
    }
    search(operation) {
        return this.run('nyxlink.search', operation, result => result.isError ? 'error' : result.tracks.length ? 'success' : 'empty');
    }
    operation(name, operation, classify = () => 'resolved') {
        return validOperations.has(name) ? this.run(name, operation, classify) : operation();
    }
    syncOperation(name, operation, classify = () => 'resolved') {
        if (this.closed || !validOperations.has(name))
            return operation();
        const start = node_perf_hooks_1.performance.now();
        const span = this.safe(() => this.options.tracer?.startSpan(name));
        let outcome = 'error';
        try {
            const result = operation();
            const observed = this.safe(() => classify(result));
            outcome = observed && validOutcomes.has(observed) ? observed : 'resolved';
            return result;
        }
        finally {
            this.safe(() => span?.setAttribute('nyxlink.outcome', outcome));
            this.safe(() => span?.setStatus({ code: outcome === 'error' ? 2 : 0 }));
            this.safe(() => span?.end());
            if (!this.closed) {
                this.safe(() => this.operationsDuration?.record(node_perf_hooks_1.performance.now() - start, { operation: name, outcome }));
                this.event('operation.' + name.slice(8) + '.' + outcome, 'unknown');
            }
        }
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        for (const node of this.handshakes.keys())
            this.finishHandshake(node, 'cancelled');
        for (const dispose of this.disposers.splice(0))
            this.safe(dispose);
    }
}
exports.OpenTelemetry = OpenTelemetry;
//# sourceMappingURL=OpenTelemetry.js.map