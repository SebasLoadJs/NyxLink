const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager, NodeState, AuroraMusicStrip, AuroraIncidentEngine, AuroraCapabilityExplorer } = require('../dist');
function manager() { return new Manager({ nodes: [{ host: 'localhost', port: 2333, password: 'fixture', secure: false }] }); }
test('music strip observes only selected player and bounds monotonic extrapolation', async () => {
    const m = manager();
    let now = 100, position = 1000;
    const track = { getInfo: () => ({ position, length: 10000, isStream: false, title: 'private-title' }) };
    const p = { manager: m, node: { connected: true }, current: track, connected: true,
        playing: true, paused: false, destroyed: false, getCrossfade: () => ({ enabled: true }) };
    const strip = new AuroraMusicStrip(p, () => now);
    try {
        assert.equal(strip.snapshot().positionMs, 1000);
        m.emit('playerUpdate', p, track, { state: { position: 1000, connected: true } });
        now += 500;
        assert.equal(strip.snapshot().positionMs, 1500);
        assert.equal(strip.snapshot().estimated, true);
        m.emit('playerUpdate', {}, track, { state: { position: 9999, connected: true } });
        assert.equal(strip.snapshot().positionMs, 1500);
        now += 6000;
        assert.equal(strip.snapshot().positionMs, 1000);
        assert.equal(strip.snapshot().estimated, false);
        p.paused = true; m.emit('playerPause', p, true);
        assert.equal(strip.snapshot().state, 'paused');
        assert.equal(strip.snapshot().positionMs, 1000);
        assert.doesNotMatch(JSON.stringify(strip.snapshot()), /private-title/);
        m.emit('trackEnd', p, track, 'crossfading');
        assert.equal(strip.snapshot().state, 'paused');
        m.emit('trackEnd', p, track, 'finished');
        assert.equal(strip.snapshot().state, 'ended');
        assert.equal(strip.snapshot().positionMs, undefined);
    } finally { strip.close(); await m.shutdown(); }
});
test('music strip does not give streams a fabricated duration or buffering state', async () => {
    const m = manager();
    const p = { manager: m, node: { connected: false }, current: { getInfo: () => ({position: 0,length: 99999,isStream: true}) },
        connected: false, playing: true, paused: false, destroyed: false, getCrossfade: () => undefined };
    const strip = new AuroraMusicStrip(p);
    try { assert.equal(strip.snapshot().state, 'unknown'); assert.equal(strip.snapshot().durationMs, undefined);
        assert.equal(strip.snapshot().stream, true); assert.equal(strip.snapshot().crossfadeConfigured, false);
    } finally { strip.close(); await m.shutdown(); }
});
test('incident history is bounded, detached and ignores duplicate final reports', () => {
    const engine = new AuroraIncidentEngine(1);
    const event = (eventCode, operationId, durationMs) => ({ eventCode, operationId, durationMs, sanitizedContext: { backend: 'nodelink' } });
    const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
    assert.equal(engine.accept(event('FAILOVER_STARTED', a)).state, 'recovering');
    assert.equal(engine.accept(event('FAILOVER_FAILED', a, 123)).state, 'failed');
    assert.equal(engine.accept(event('FAILOVER_RECOVERED', a, 456)), undefined);
    assert.equal(engine.accept(event('FAILOVER_STARTED', 'private')), undefined);
    const record = engine.accept(event('FAILOVER_CANCELLED', b));
    record.state = 'recovered';
    assert.deepEqual(engine.snapshot(), [{ operationId: b, state: 'cancelled', backend: 'nodelink' }]);
});
test('capability explorer masks identities and preserves observed capability states', async () => {
    const m = manager();
    const node = { identifier: 'secret-host', connected: true, destroyed: false, draining: false, state: NodeState.READY,
        latency: 0, stats: { memory: { used: 123 } }, backend: { kind: 'lavalink', listFeatures: () => [
            { feature: 'tracks:load', state: 'available', evidence: 'protocol' },
            { feature: 'mixer', state: 'unknown', evidence: 'none' },
            { feature: 'secret URL', state: 'available', evidence: 'observed' },
        ] } };
    m.nodes.nodes.set(node.identifier, node);
    const explorer = new AuroraCapabilityExplorer(m);
    try {
        const [first] = explorer.snapshot();
        assert.equal(first.alias, 'NODE-01'); assert.equal(first.ready, true);
        assert.equal(first.latencyMs, 0); assert.equal(first.memoryUsedBytes, 123);
        assert.equal(first.capabilities.length, 2);
        assert.equal(first.capabilities[1].state, 'unknown');
        assert.doesNotMatch(JSON.stringify(first), /secret/);
        node.connected = false;
        const [offline] = explorer.snapshot();
        assert.equal(offline.alias, first.alias); assert.equal(offline.ready, false);
        assert.equal(offline.memoryUsedBytes, undefined); assert.equal(offline.latencyMs, undefined);
        assert.deepEqual(offline.capabilities, []);
    } finally { m.nodes.nodes.clear(); await m.shutdown(); }
});
