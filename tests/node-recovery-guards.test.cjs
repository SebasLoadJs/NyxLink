const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager, Node, NodeSelector, NodeHealthMonitor, NodeCircuitBreaker, CircuitOpenError, HttpError } = require('../dist');
const { NodeState } = require('../dist/src/typings/types');
const { DatabaseManager } = require('../dist/src/managers/DatabaseManager');
const { createTrack, deferred } = require('./helpers/player.cjs');

function clock(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
}

async function fail(breaker, error = new HttpError(503)) {
  await assert.rejects(breaker.run(async () => { throw error; }), candidate => candidate === error);
}

for (const options of [undefined, false]) {
  test(`the circuit breaker is disabled with ${String(options)} configuration`, async () => {
    const breaker = new NodeCircuitBreaker(options);
    for (let index = 0; index < 5; index++) await fail(breaker);
    assert.equal(breaker.state, 'closed');
    assert.equal(await breaker.run(async () => 'available'), 'available');
  });
}

test('the enabled circuit opens after the failure threshold and rejects before further I/O', async t => {
  clock(t);
  const breaker = new NodeCircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 });
  await fail(breaker);
  assert.equal(breaker.state, 'closed');
  await fail(breaker);
  assert.equal(breaker.state, 'open');
  assert.equal(breaker.retryAt, 101000);
  let effects = 0;
  await assert.rejects(breaker.run(async () => { effects++; }), error => {
    assert.ok(error instanceof CircuitOpenError);
    assert.equal(error.code, 'CIRCUIT_OPEN');
    return true;
  });
  assert.equal(effects, 0);
});

test('failures outside the configured window do not combine into an old outage', async t => {
  clock(t);
  const breaker = new NodeCircuitBreaker({ failureThreshold: 2, windowMs: 100 });
  await fail(breaker);
  t.mock.timers.tick(101);
  await fail(breaker);
  assert.equal(breaker.state, 'closed');
  await fail(breaker);
  assert.equal(breaker.state, 'open');
});

test('a successful request resets consecutive infrastructure failures', async () => {
  const breaker = new NodeCircuitBreaker({ failureThreshold: 2 });
  await fail(breaker);
  await breaker.run(async () => ({ ok: true }));
  await fail(breaker);
  assert.equal(breaker.state, 'closed');
});

for (const status of [429, 500, 503]) {
  test(`HTTP ${status} is an infrastructure failure for the node circuit`, async () => {
    const breaker = new NodeCircuitBreaker({ failureThreshold: 1 });
    await fail(breaker, new HttpError(status));
    assert.equal(breaker.state, 'open');
  });
}

test('transport errors count while client and track-specific errors leave the node eligible', async () => {
  for (const code of ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE']) {
    const breaker = new NodeCircuitBreaker({ failureThreshold: 1 });
    await fail(breaker, Object.assign(new Error('network failure'), { code }));
    assert.equal(breaker.state, 'open', code);
  }
  const breaker = new NodeCircuitBreaker({ failureThreshold: 1 });
  for (const error of [new HttpError(400), new HttpError(401), new HttpError(403), new HttpError(404), new Error('Track could not be loaded')]) {
    await fail(breaker, error);
    assert.equal(breaker.state, 'closed');
  }
});

test('only one request probes a half-open circuit and confirmed success restores eligibility', async t => {
  clock(t);
  const breaker = new NodeCircuitBreaker({ failureThreshold: 1, cooldownMs: 100 });
  await fail(breaker);
  t.mock.timers.tick(100);
  const response = deferred();
  const probe = breaker.run(() => response.promise);
  assert.equal(breaker.state, 'half-open');
  let duplicateRequests = 0;
  await assert.rejects(breaker.run(async () => { duplicateRequests++; }), { code: 'CIRCUIT_OPEN' });
  assert.equal(duplicateRequests, 0);
  response.resolve('healthy');
  assert.equal(await probe, 'healthy');
  assert.equal(breaker.state, 'closed');
  assert.equal(await breaker.run(async () => 'next'), 'next');
});

test('a failed half-open probe starts another cooldown rather than admitting a retry storm', async t => {
  clock(t);
  const breaker = new NodeCircuitBreaker({ failureThreshold: 1, cooldownMs: 100 });
  await fail(breaker);
  t.mock.timers.tick(100);
  await fail(breaker);
  assert.equal(breaker.state, 'open');
  assert.equal(breaker.retryAt, 100200);
  await assert.rejects(breaker.run(async () => 'too early'), { code: 'CIRCUIT_OPEN' });
});

test('an older successful response cannot close a circuit opened by a newer failure', async () => {
  const breaker = new NodeCircuitBreaker({ failureThreshold: 1 });
  const response = deferred();
  const oldRequest = breaker.run(() => response.promise);
  await fail(breaker);
  response.resolve('late success');
  assert.equal(await oldRequest, 'late success');
  assert.equal(breaker.state, 'open');
  await assert.rejects(breaker.run(async () => 'must stay blocked'), { code: 'CIRCUIT_OPEN' });
});

test('invalid circuit options reject before any request can execute', () => {
  assert.equal(typeof NodeCircuitBreaker, 'function');
  for (const options of [true, null, [], { failureThreshold: 0 }, { failureThreshold: 1.5 }, { failureThreshold: NaN }, { windowMs: 0 }, { windowMs: Infinity }, { cooldownMs: -1 }]) {
    assert.throws(() => new NodeCircuitBreaker(options), TypeError, JSON.stringify(options));
  }
});

function audioNode(identifier, overrides = {}) {
  return {
    identifier, uuid: identifier, connected: true, destroyed: false, state: NodeState.READY,
    stats: { players: 1, cpu: { systemLoad: 0.1 }, memory: { used: 1, allocated: 10 } },
    ...overrides,
  };
}

test('draining is a hard exclusion even when unhealthy fallback is allowed', () => {
  const draining = audioNode('draining', { draining: true });
  const available = audioNode('available', { stats: { players: 100 } });
  assert.equal(NodeSelector.select([draining, available], {}, { allowUnhealthyFallback: true }), available);
  assert.equal(NodeSelector.matches(draining), false);
  assert.equal(NodeSelector.rejections([draining])[0].reasons.includes('draining'), true);
});

for (const state of ['open', 'half-open']) {
  test(`a ${state} circuit cannot receive newly selected playback work`, () => {
    const rejected = audioNode('unrecovered', { circuit: { state } });
    const available = audioNode('available', { stats: { players: 100 } });
    assert.equal(NodeSelector.select([rejected, available], {}, { allowUnhealthyFallback: true }), available);
    assert.equal(NodeSelector.matches(rejected), false);
    assert.equal(NodeSelector.rejections([rejected])[0].reasons.includes('circuit-open'), true);
  });
}

test('health reports draining and an open circuit rather than healthy stale statistics', () => {
  assert.equal(NodeHealthMonitor.inspect(audioNode('maintenance', { draining: true })).state, 'draining');
  assert.equal(NodeHealthMonitor.inspect(audioNode('failing', { circuit: { state: 'open' } })).state, 'unhealthy');
  assert.equal(NodeHealthMonitor.inspect(audioNode('healthy', { circuit: { state: 'closed' } })).state, 'healthy');
});

function pool(t, identifiers = ['source', 'target'], nodeOptions = {}) {
  const manager = new Manager({
    nodes: [{ host: '127.0.0.1', port: 2333, password: 'test', secure: false }],
    send() {}, options: { node: nodeOptions, database: { type: 'memory' } },
  });
  manager.database = new DatabaseManager(manager);
  const nodes = identifiers.map((identifier, index) => {
    const node = new Node(manager, { identifier, host: '127.0.0.1', port: 2400 + index, password: 'test', secure: false });
    Object.assign(node, audioNode(identifier));
    node.rest.destroyPlayer = async () => {};
    node.rest.updatePlayer = async (_guild, payload) => payload;
    manager.nodes.nodes.set(identifier, node);
    return node;
  });
  function create(guildId = '123456789012345678') {
    const player = manager.players.create({ guildId, voiceChannelId: '223456789012345678', autoPlay: false });
    player.stopHealthCheck();
    player.voice.connect = async () => {};
    player.voice.sessionId = 'test-session';
    player.voice.token = 'test-token';
    player.voice.endpoint = 'test.invalid';
    return player;
  }
  t.after(async () => {
    for (const player of manager.players.all) player.stopHealthCheck();
    for (const node of nodes) await node.destroy();
    await manager.database.shutdown();
  });
  return { manager, nodes, create };
}

test('a node owns the configured circuit while ordinary nodes remain unaffected', async t => {
  const { nodes: [configured] } = pool(t, ['configured'], { circuitBreaker: { failureThreshold: 1 } });
  await fail(configured.circuit);
  assert.equal(configured.circuit.state, 'open');
  assert.equal(NodeSelector.matches(configured), false);
  const { nodes: [ordinary] } = pool(t, ['ordinary']);
  await fail(ordinary.circuit);
  assert.equal(ordinary.circuit.state, 'closed');
  assert.equal(NodeSelector.matches(ordinary), true);
});

test('setDraining pauses assignment without disconnecting nodes or migrating existing players', async t => {
  const { manager, nodes: [source, target], create } = pool(t);
  const player = create();
  let transfers = 0;
  player.transferNode = async () => { transfers++; return false; };
  assert.equal(manager.nodes.setDraining(source.identifier), true);
  assert.equal(source.draining, true);
  assert.equal(manager.nodes.findNode(), target);
  assert.equal(player.node, source);
  assert.equal(source.connected, true);
  assert.equal(source.destroyed, false);
  assert.equal(transfers, 0);
  assert.equal(manager.nodes.setDraining(source.identifier, false), true);
  assert.equal(manager.nodes.findNode(), source);
});

test('draining an empty node retains it for explicit re-enablement', async t => {
  const { manager, nodes: [source] } = pool(t, ['source']);
  assert.equal(await manager.nodes.drain(source.identifier), true);
  assert.equal(source.draining, true);
  assert.equal(source.connected, true);
  assert.equal(source.destroyed, false);
  assert.equal(manager.nodes.nodes.get(source.identifier), source);
  assert.equal(manager.nodes.findNode(), undefined);
  assert.equal(manager.nodes.setDraining(source.identifier, false), true);
  assert.equal(manager.nodes.findNode(), source);
});

test('drain marks the source synchronously and migrates the existing playback snapshot', async t => {
  const { manager, nodes: [source, target], create } = pool(t);
  const player = create();
  player.current = createTrack('current');
  player.current.position = 42000;
  player.paused = true;
  player.volume = 62;
  const queued = createTrack('queued');
  player.queue.add(queued);
  const moving = manager.nodes.drain(source.identifier);
  assert.equal(source.draining, true);
  const newPlayer = create('323456789012345678');
  assert.equal(newPlayer.node, target);
  assert.equal(await moving, true);
  assert.equal(player.node, target);
  assert.deepEqual(player.queue.tracks, [queued]);
  assert.equal(player.current.position, 42000);
  assert.equal(player.paused, true);
  assert.equal(player.volume, 62);
  assert.equal(source.destroyed, false);
  assert.equal(manager.nodes.nodes.get(source.identifier), source);
});

test('a drain with no destination retains every player and queue even when preserveOnFailure is false', async t => {
  const { manager, nodes: [source], create } = pool(t, ['source'], { failover: { preserveOnFailure: false } });
  const player = create();
  const current = createTrack('current');
  const queued = createTrack('queued');
  player.current = current;
  player.queue.add(queued);
  assert.equal(await manager.nodes.drain(source.identifier), false);
  assert.equal(source.draining, true);
  assert.equal(source.connected, true);
  assert.equal(source.destroyed, false);
  assert.equal(player.destroyed, false);
  assert.equal(player.node, source);
  assert.equal(player.current, current);
  assert.deepEqual(player.queue.tracks, [queued]);
  assert.equal(manager.players.get(player.guildId), player);
});

test('partial drain failure preserves the failed snapshot and keeps the node marked for maintenance', async t => {
  const { manager, nodes: [source, target], create } = pool(t, ['source', 'target'], { failover: { maxAttempts: 1, preserveOnFailure: false } });
  const recovered = create();
  const failed = create('323456789012345678');
  recovered.current = createTrack('recovered');
  failed.current = createTrack('failed');
  const queued = createTrack('queued');
  failed.queue.add(queued);
  target.rest.updatePlayer = async (guild, payload) => {
    if (guild === failed.guildId) throw new HttpError(503);
    return payload;
  };
  assert.equal(await manager.nodes.drain(source.identifier), false);
  assert.equal(recovered.node, target);
  assert.equal(recovered.destroyed, false);
  assert.equal(failed.destroyed, false);
  assert.equal(failed.current.identifier, 'failed');
  assert.deepEqual(failed.queue.tracks, [queued]);
  assert.equal(source.destroyed, false);
  assert.equal(source.draining, true);
  assert.equal(manager.nodes.nodes.get(source.identifier), source);
});

test('duplicate drains share a migration and refuse re-enablement until that migration settles', async t => {
  const { manager, nodes: [source, target], create } = pool(t);
  const player = create();
  const started = deferred();
  const response = deferred();
  let transfers = 0;
  player.transferNode = async destination => {
    transfers++;
    started.resolve();
    await response.promise;
    player.node = destination;
    return true;
  };
  const first = manager.nodes.drain(source.identifier);
  await started.promise;
  const duplicate = manager.nodes.drain(source.identifier);
  assert.equal(manager.nodes.setDraining(source.identifier, false), false);
  assert.equal(source.draining, true);
  response.resolve();
  assert.deepEqual(await Promise.all([first, duplicate]), [true, true]);
  assert.equal(transfers, 1);
  assert.equal(player.node, target);
  assert.equal(manager.nodes.setDraining(source.identifier, false), true);
  assert.equal(source.draining, false);
});

test('missing, destroyed and shut-down nodes cannot begin a drain or be rehabilitated', async t => {
  const { manager, nodes: [source] } = pool(t, ['source']);
  assert.equal(await manager.nodes.drain('missing'), false);
  assert.equal(manager.nodes.setDraining('missing'), false);
  await source.destroy();
  assert.equal(await manager.nodes.drain(source.identifier), false);
  assert.equal(manager.nodes.setDraining(source.identifier, false), false);
  const { manager: closed, nodes: [other] } = pool(t, ['other']);
  await closed.shutdown();
  assert.equal(await closed.nodes.drain(other.identifier), false);
  assert.equal(closed.nodes.setDraining(other.identifier), false);
  assert.notEqual(other.draining, true);
});
