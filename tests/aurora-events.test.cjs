const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager } = require('../dist');
function fixture(options = {}) {
    const events = [];
    const target = Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(level => [level, (event, message) => events.push({ level, event, message })]));
    const manager = new Manager({
        nodes: [{ identifier: 'private-node', host: '127.0.0.1', port: 2333, password: 'private-password', secure: false }],
        options: { aurora: { level: 'debug', target, ...options } },
    });
    return { manager, events };
}
test('Aurora emits a single allowlisted event per signal and measures failover operation', async () => {
    const { manager, events } = fixture({ traceContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }) });
    try {
        const node = { backend: { kind: 'nodelink' }, identifier: 'private-id' };
        const player = { node, guildId: 'private-guild' };
        manager.emit('nodeReady', node, { token: 'private-token' });
        manager.emit('queueAdd', player, [{ title: 'private-title' }]);
        manager.emit('playerNodeFailover', player, { status: 'in-progress', source: 'private-source', target: 'private-target' });
        manager.emit('playerNodeFailover', player, { status: 'recovered', reason: 'private-reason' });
        assert.deepEqual(events.map(x => x.event.eventCode), ['NODE_READY','QUEUE_ADDED','FAILOVER_STARTED','FAILOVER_RECOVERED']);
        assert.equal(events[1].event.sanitizedContext.trackCount, 1);
        assert.equal(events[3].event.outcome, 'confirmed');
        assert.equal(events[2].event.operationId, events[3].event.operationId);
        assert.ok(events[3].event.durationMs >= 0);
        assert.ok(events.every(x => x.event.traceId === 'a'.repeat(32)));
        assert.doesNotMatch(JSON.stringify(events), /private-/);
    } finally { await manager.shutdown(); }
});
test('Aurora filters categories and levels and never invents recovery success or duration', async () => {
    const { manager, events } = fixture({ level: 'warn', categories: ['FAILOVER'] });
    const player = { node: { backend: { kind: 'lavalink' } } };
    try {
        manager.emit('nodeError', player.node, Error('private-error'));
        manager.emit('playerNodeFailover', player, { status: 'failed' });
        assert.deepEqual(events.map(x => x.event.eventCode), ['FAILOVER_FAILED']);
        assert.equal(events[0].event.durationMs, undefined);
        assert.equal(events[0].level, 'error');
    } finally { await manager.shutdown(); }
});
test('Aurora is silent by default, rejects dual routing and isolates sink failures', async () => {
    const { manager, events } = fixture({ level: 'silent' });
    manager.emit('nodeReady', {});
    assert.equal(events.length, 0);
    await manager.shutdown();
    const nodes = [{ host: '127.0.0.1', port: 2333, password: 'fixture', secure: false }];
    assert.throws(() => new Manager({ nodes, options: { logging: {}, aurora: {} } }), /not both/);
    const fail = () => { throw Error('sink failure'); };
    const second = fixture({ target: Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(level => [level, fail])), traceContext: fail });
    assert.doesNotThrow(() => second.manager.emit('nodeReady', {}));
    await second.manager.shutdown();
});
test('Aurora detaches from manager shutdown', async () => {
    const { manager, events } = fixture();
    await manager.shutdown();
    manager.emit('nodeReady', {});
    assert.equal(events.length, 0);
});
