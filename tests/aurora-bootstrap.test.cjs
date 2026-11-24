const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager, AuroraBootstrap, NodeState } = require('../dist');

function fixture() {
    const manager = new Manager({ nodes: [{ identifier: 'a', host: 'localhost', port: 2333, password: 'fixture', secure: false }] });
    const events = [];
    return { manager, events, bootstrap: options => new AuroraBootstrap(manager, { timeoutMs: 25, onSnapshot: x => events.push(x), ...options }) };
}
function node(manager, id, ready) {
    const value = { identifier: id, connected: ready, destroyed: false, state: ready ? NodeState.READY : NodeState.CONNECTING };
    manager.nodes.nodes.set(id, value);
    return value;
}
test('initialization preserves result and original error, separate from network readiness', async () => {
    const { manager, events, bootstrap } = fixture();
    manager.init = async () => manager;
    assert.equal(await bootstrap().initialize('123456789012345678'), manager);
    assert.deepEqual(events.map(x => x.phase), ['initializing', 'initialized']);
    const error = Error('original');
    manager.init = async () => { throw error; };
    await assert.rejects(bootstrap().initialize('x'), e => e === error);
    assert.equal(events.at(-1).phase, 'initialization-failed');
    await manager.shutdown();
});
test('network progress counts only confirmed READY nodes and deduplicates updates', async () => {
    const { manager, events, bootstrap } = fixture();
    const a = node(manager, 'a', false);
    const b = node(manager, 'b', false);
    const result = bootstrap().observeNetwork();
    a.connected = true; a.state = NodeState.READY;
    manager.emit('nodeReady', a, {}); manager.emit('nodeReady', a, {});
    b.connected = true; b.state = NodeState.READY;
    manager.emit('nodeReady', b, {});
    assert.equal((await result).phase, 'ready');
    assert.deepEqual(events.map(x => [x.phase,x.ready,x.total]), [['connecting',0,2],['connecting',1,2],['ready',2,2]]);
    assert.ok(events.every(x => x.durationMs >= 0));
    manager.nodes.nodes.clear();
    await manager.shutdown();
});
test('network timeout reports partial, never false readiness', async () => {
    const { manager, bootstrap } = fixture();
    node(manager, 'a', true); node(manager, 'b', false);
    assert.equal((await bootstrap().observeNetwork()).phase, 'partial');
    manager.nodes.nodes.clear();
    await manager.shutdown();
});
test('abort detaches observation and rendering errors do not affect result', async () => {
    const { manager, events, bootstrap } = fixture();
    const a = node(manager, 'a', false);
    const controller = new AbortController();
    const result = bootstrap({ signal: controller.signal }).observeNetwork();
    controller.abort();
    assert.equal((await result).phase, 'cancelled');
    const count = events.length;
    manager.emit('nodeReady', a, {});
    assert.equal(events.length, count);
    manager.nodes.nodes.clear();
    assert.equal((await bootstrap({ onSnapshot: () => { throw Error('renderer'); } }).observeNetwork()).phase, 'no-nodes');
    await manager.shutdown();
});
