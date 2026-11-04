const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager, Node, NodeState, NodeFailover } = require('../dist');
const { playbackGuard } = require('../dist/src/players/PlaybackGuard');

function manager(t, nodeOptions = {}) {
  const value = new Manager({
    nodes: [{ host: '127.0.0.1', port: 2333, password: 'test', secure: false }],
    options: { node: nodeOptions, database: { type: 'memory' } },
  });
  t.after(() => value.shutdown());
  return value;
}

function node(t, owner, config = {}) {
  const value = new Node(owner, { identifier: 'source', host: '127.0.0.1', port: 2400, password: 'test', secure: false, retryAmount: 20, ...config });
  t.after(() => value.destroy());
  return value;
}

for (const scenario of [
  { name: 'lower bound', global: 0.5, sample: 0, base: 1000, attempts: 0, expected: 500 },
  { name: 'interior sample', global: 0.5, sample: 0.5, base: 1000, attempts: 0, expected: 750 },
  { name: 'exponential base', global: 0.5, sample: 0.5, base: 1000, attempts: 2, expected: 3000 },
  { name: 'cap before jitter', global: 1, sample: 0.5, base: 200000, attempts: 2, expected: 150000 },
  { name: 'per-node override', global: 0.8, override: 0.25, sample: 0, base: 1000, attempts: 0, expected: 750 },
]) {
  test(`public reconnect applies bounded jitter at its ${scenario.name}`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
    const owner = manager(t, { retryJitter: scenario.global });
    const value = node(t, owner, { retryDelay: scenario.base, ...(scenario.override !== undefined ? { retryJitter: scenario.override } : {}) });
    value.reconnectAttempts = scenario.attempts;
    let connections = 0;
    t.mock.method(value, 'connect', async () => { connections++; });
    t.mock.method(Math, 'random', () => scenario.sample);
    value.reconnect();
    t.mock.timers.tick(scenario.expected - 1);
    assert.equal(connections, 0);
    t.mock.timers.tick(1);
    assert.equal(connections, 1);
  });
}

test('zero reconnect jitter retains deterministic backoff without sampling randomness', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const owner = manager(t, { retryJitter: 1 });
  const value = node(t, owner, { retryDelay: 1000, retryJitter: 0 });
  let connections = 0;
  t.mock.method(value, 'connect', async () => { connections++; });
  t.mock.method(Math, 'random', () => { throw new Error('zero jitter must not sample'); });
  value.reconnect();
  t.mock.timers.tick(999);
  assert.equal(connections, 0);
  t.mock.timers.tick(1);
  assert.equal(connections, 1);
});

for (const ratio of [-0.1, 1.1, NaN, Infinity, '0.5', null]) {
  test(`invalid global and per-node reconnect jitter reject: ${String(ratio)}`, t => {
    const invalidGlobal = manager(t, { retryJitter: ratio });
    assert.throws(() => node(t, invalidGlobal), TypeError);
    const validGlobal = manager(t);
    assert.throws(() => node(t, validGlobal, { retryJitter: ratio }), TypeError);
  });
}

for (const scenario of [
  { name: 'global jitter', global: 0.5, sample: 0.5, expected: 750 },
  { name: 'explicit override', global: 1, override: 0.25, sample: 0, expected: 750 },
  { name: 'explicit zero override', global: 1, override: 0, sample: 0, expected: 1000 },
]) {
  test(`failover waits for its ${scenario.name} delay before trying another destination`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
    const owner = manager(t, { retryJitter: scenario.global });
    const source = node(t, owner);
    const targets = ['first', 'second'].map((identifier, index) => {
      const target = node(t, owner, { identifier, port: 2401 + index });
      target.connected = true;
      target.state = NodeState.READY;
      owner.nodes.nodes.set(identifier, target);
      return target;
    });
    source.connected = true;
    source.state = NodeState.READY;
    owner.nodes.nodes.set(source.identifier, source);
    const attempts = [];
    const player = {
      manager: owner, node: source, destroyed: false, nodeSelection: {},
      async transferNode(target) {
        playbackGuard(this).invalidate();
        attempts.push({ node: target, at: Date.now() });
        if (target === targets[0]) return false;
        this.node = target;
        return true;
      },
    };
    let randomSamples = 0;
    t.mock.method(Math, 'random', () => { randomSamples++; return scenario.sample; });
    const moving = NodeFailover.move(player, source, { maxAttempts: 2, retryDelayMs: 1000, ...(scenario.override !== undefined ? { retryJitter: scenario.override } : {}) });
    t.after(async () => { t.mock.timers.runAll(); await moving.catch(() => {}); });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(attempts.length, 1);
    t.mock.timers.tick(scenario.expected - 1);
    await Promise.resolve();
    assert.equal(attempts.length, 1);
    t.mock.timers.tick(1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(attempts.length, 2);
    assert.equal((await moving).status, 'recovered');
    assert.deepEqual(attempts.map(value => value.at), [1000, 1000 + scenario.expected]);
    assert.equal(randomSamples, scenario.override === 0 ? 0 : 1);
  });
}

test('invalid failover jitter rejects before selecting or transferring a player', async t => {
  const owner = manager(t);
  const source = node(t, owner);
  let transfers = 0;
  const player = { manager: owner, node: source, destroyed: false, nodeSelection: {}, async transferNode() { transfers++; return true; } };
  for (const retryJitter of [-0.01, 1.01, NaN, Infinity, '0.5', null]) {
    await assert.rejects(NodeFailover.move(player, source, { retryJitter }), TypeError);
  }
  assert.equal(transfers, 0);
});
