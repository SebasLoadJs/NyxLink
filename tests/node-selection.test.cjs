const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager } = require('../dist');
const { NodeState } = require('../dist/src/typings/types.js');
const { NodeSelector } = require('../dist');

function audioNode(identifier, overrides = {}) {
  return {
    identifier, uuid: identifier, connected: true, destroyed: false,
    state: NodeState.READY,
    stats: {
      players: 3, playingPlayers: 2, uptime: 1000,
      cpu: { systemLoad: 0.1, lavalinkLoad: 0.1 },
      memory: { used: 10, allocated: 100 },
    },
    ...overrides,
  };
}

function managerWith(nodes, options = {}) {
  const manager = new Manager({
    nodes: [{ host: '127.0.0.1', port: 2333, password: 'test', secure: false }],
    options: { node: options, database: { type: 'memory' } },
  });
  for (const node of nodes) manager.nodes.nodes.set(node.identifier, node);
  return manager;
}

test('weighted selection combines measured costs and preserves legacy selection by default', () => {
  const a = audioNode('a', { latency: 100, statsReceivedAt: Date.now() });
  const b = audioNode('b', { latency: 5, statsReceivedAt: Date.now() });
  b.stats.players = 5;
  assert.equal(NodeSelector.select([a, b]), a);
  assert.equal(NodeSelector.select([a, b], {}, { scoreWeights: { players: 1, latency: 0.1 } }), b);
  b.stats.memory.used = 99;
  assert.equal(NodeSelector.select([a, b], {}, { scoreWeights: { memory: 100 } }), a);
});

test('weighted selection rejects stale, future, absent and nonfinite measurements as winning costs', () => {
  const valid = audioNode('valid', { latency: 20, statsReceivedAt: Date.now() });
  for (const receivedAt of [undefined, NaN, Date.now() + 100000, Date.now() - 200000]) {
    const invalid = audioNode('invalid', { statsReceivedAt: receivedAt });
    invalid.stats.players = 0;
    assert.equal(NodeSelector.select([invalid, valid], {}, { scoreWeights: { players: 1 } }), valid);
  }
  const unknown = audioNode('unknown', { latency: -1 });
  assert.equal(NodeSelector.select([unknown, valid], {}, { scoreWeights: { latency: 1 } }), valid);
  valid.statsReceivedAt = undefined;
  assert.equal(NodeSelector.select([unknown, valid], {}, { scoreWeights: { latency: 1 } }), valid);
});

test('weighted costs support configured negative priorities and ignore disabled metrics', () => {
  const a = audioNode('a', { priority: -10 });
  const b = audioNode('b', { priority: 1 });
  assert.equal(NodeSelector.select([a, b], {}, { scoreWeights: { priority: 1, memory: 0 } }), a);
});

test('memory costs reject invalid denominators rather than converting Infinity into idle usage', () => {
  const valid = audioNode('valid', { statsReceivedAt: Date.now() });
  for (const allocated of [0, -1, NaN, Infinity]) {
    const invalid = audioNode('invalid', { statsReceivedAt: Date.now() });
    invalid.stats.memory.allocated = allocated;
    assert.equal(NodeSelector.select([invalid, valid], {}, { scoreWeights: { memory: 1 } }), valid);
  }
});

test('hysteresis retains an eligible preferred node at the margin and switches above it', () => {
  const preferred = audioNode('preferred');
  const candidate = audioNode('candidate');
  preferred.stats.players = 10;
  candidate.stats.players = 9;
  const options = { preferredNode: 'preferred', minimumScoreImprovement: 1 };
  assert.equal(NodeSelector.select([candidate, preferred], { selectionStrategy: 'leastPlayers' }, options), preferred);
  candidate.stats.players = 8;
  assert.equal(NodeSelector.select([candidate, preferred], { selectionStrategy: 'leastPlayers' }, options), candidate);
});

test('hysteresis cannot retain excluded, draining, incompatible or unhealthy preferred nodes', () => {
  const preferred = audioNode('preferred');
  const candidate = audioNode('candidate');
  const options = { preferredNode: 'preferred', minimumScoreImprovement: 1000 };
  for (const selection of [{ exclude: ['preferred'] }, { allowUnhealthyFallback: false }]) {
    preferred.stats.cpu.systemLoad = 0.99;
    assert.equal(NodeSelector.select([preferred, candidate], {}, { ...options, ...selection }), candidate);
  }
  preferred.draining = true;
  assert.equal(NodeSelector.select([preferred, candidate], {}, options), candidate);
});

test('hysteresis cannot retain unknown weighted costs over an observed candidate', () => {
  const preferred = audioNode('preferred', { latency: -1 });
  const candidate = audioNode('candidate', { latency: 5 });
  assert.equal(NodeSelector.select([preferred, candidate], {}, {
    preferredNode: 'preferred', minimumScoreImprovement: 1000, scoreWeights: { latency: 1 },
  }), candidate);
});

test('weighted selection keeps stable fallback order when every selected measurement is unknown', () => {
  const a = audioNode('a'), b = audioNode('b');
  assert.equal(NodeSelector.select([a, b], {}, { scoreWeights: { latency: 1 } }), a);
});

test('region and source preferences precede weighted cost and hysteresis', () => {
  const preferred = audioNode('preferred', { regions: ['eu'], latency: 1 });
  const candidate = audioNode('candidate', { regions: ['us'], latency: 100 });
  const options = { scoreWeights: { latency: 1 }, preferredNode: 'preferred', minimumScoreImprovement: 1000 };
  assert.equal(NodeSelector.select([preferred, candidate], {}, { ...options, region: 'us' }), candidate);
  preferred.sourceHealth = new Map([['youtube', { receivedAt: Date.now(), health: { status: 'unavailable' } }]]);
  candidate.sourceHealth = new Map([['youtube', { receivedAt: Date.now(), health: { status: 'healthy' } }]]);
  assert.equal(NodeSelector.select([preferred, candidate], {}, { ...options, preferSource: 'youtube' }), candidate);
});

test('invalid weighted selection and hysteresis configurations fail before selection', () => {
  for (const scoreWeights of [{}, { cpu: -1 }, { cpu: NaN }, { memory: Infinity }, { unknown: 1 }, { players: 0 }, [], null]) {
    assert.throws(() => NodeSelector.select([], {}, { scoreWeights }), TypeError);
  }
  for (const selection of [{ preferredNode: '' }, { minimumScoreImprovement: 1 }, { preferredNode: 'a', minimumScoreImprovement: -1 }]) {
    assert.throws(() => NodeSelector.select([], {}, selection), TypeError);
  }
});

test('excluding the only READY node still permits a connected fallback node', () => {
  const excluded = audioNode('ready');
  const fallback = audioNode('connected', { state: NodeState.CONNECTED });
  const manager = managerWith([excluded, fallback]);
  assert.equal(manager.nodes.findNode({ exclude: ['ready'] }), fallback);
});

test('a destroyed node is ineligible even when stale flags say connected and READY', () => {
  const destroyed = audioNode('destroyed', { destroyed: true });
  const available = audioNode('available', { state: NodeState.CONNECTED });
  const manager = managerWith([destroyed, available]);
  assert.equal(manager.nodes.findNode(), available);
});

test('a disconnected node is ineligible even when its stale state says READY', () => {
  const disconnected = audioNode('disconnected', { connected: false });
  const available = audioNode('available', { state: NodeState.CONNECTED });
  const manager = managerWith([disconnected, available]);
  assert.equal(manager.nodes.findNode(), available);
});

test('health filtering tolerates partial server stats without throwing', () => {
  const partial = audioNode('partial', { stats: { players: 0 } });
  const measured = audioNode('measured');
  const manager = managerWith([partial, measured], { avoidUnhealthyNodes: true });
  let selected;
  assert.doesNotThrow(() => { selected = manager.nodes.findNode(); });
  assert.ok([partial, measured].includes(selected));
});

test('a nonfinite player score cannot beat a finite measured player score', () => {
  const invalid = audioNode('invalid');
  invalid.stats.players = NaN;
  const measured = audioNode('measured');
  const manager = managerWith([invalid, measured], { selectionStrategy: 'leastPlayers' });
  assert.equal(manager.nodes.findNode(), measured);
});

test('health filtering avoids nonfinite load and zero allocated memory when a healthy node exists', () => {
  const invalid = audioNode('invalid');
  invalid.stats.cpu.systemLoad = NaN;
  invalid.stats.memory.allocated = 0;
  const measured = audioNode('measured');
  const manager = managerWith([invalid, measured], { avoidUnhealthyNodes: true });
  assert.equal(manager.nodes.findNode(), measured);
});

test('priority selection preserves the lower-number-wins convention', () => {
  const lowerPriority = audioNode('later', { priority: 10 });
  const preferred = audioNode('preferred', { priority: 1 });
  const manager = managerWith([lowerPriority, preferred], { selectionStrategy: 'priority' });
  assert.equal(manager.nodes.findNode(), preferred);
});

test('uptime selection prefers the larger measured uptime', () => {
  const newer = audioNode('newer');
  const older = audioNode('older');
  older.stats.uptime = 5000;
  const manager = managerWith([newer, older], { selectionStrategy: 'uptime' });
  assert.equal(manager.nodes.findNode(), older);
});

test('leastPlayers selection chooses fewer players and preserves insertion order on ties', () => {
  const busy = audioNode('busy');
  const firstIdle = audioNode('first-idle');
  const secondIdle = audioNode('second-idle');
  firstIdle.stats.players = secondIdle.stats.players = 0;
  const manager = managerWith([busy, firstIdle, secondIdle], { selectionStrategy: 'leastPlayers' });
  assert.equal(manager.nodes.findNode(), firstIdle);
});

test('selecting a node for new work never migrates an existing player', () => {
  const existing = audioNode('existing');
  const idle = audioNode('idle');
  idle.stats.players = 0;
  const manager = managerWith([existing, idle], { selectionStrategy: 'leastPlayers' });
  const player = { node: existing, transferNode() { throw new Error('unexpected migration'); } };
  manager.players.players.set('123456789012345678', player);
  assert.equal(manager.nodes.findNode(), idle);
  assert.equal(player.node, existing);
});

test('health preference considers a healthy connected fallback before an overloaded READY node', () => {
  const overloaded = audioNode('overloaded');
  overloaded.stats.cpu.systemLoad = 0.99;
  const fallback = audioNode('fallback', { state: NodeState.CONNECTED });
  const manager = managerWith([overloaded, fallback], { avoidUnhealthyNodes: true });
  assert.equal(manager.nodes.findNode(), fallback);
});

test('failover selection can disallow the legacy overloaded-node fallback', () => {
  const overloaded = audioNode('overloaded');
  overloaded.stats.cpu.systemLoad = 0.99;
  const manager = managerWith([overloaded], { avoidUnhealthyNodes: true });
  assert.equal(manager.nodes.findNode({ allowUnhealthyFallback: false }), undefined);
  assert.equal(manager.nodes.findNode(), overloaded);
});
