const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlayer } = require('./helpers/player.cjs');
const { NodeFailover } = require('../dist/src/nodes/NodeFailover.js');

test('cancelled migration leaves source-owned player in orphan handling', async t => {
  const { manager, node, player } = createPlayer(t);
  const originalMove = NodeFailover.move;
  NodeFailover.move = async () => ({ status: 'cancelled', attempts: 0 });
  t.after(() => { NodeFailover.move = originalMove; });
  manager.options.node = {
    ...manager.options.node,
    autoMovePlayers: true,
    failover: { preserveOnFailure: true },
  };
  node.retryAmount = 0;
  node.reconnectAttempts = 0;
  const orphaned = [];
  manager.on('playersOrphaned', players => orphaned.push(...players));

  await node.close({ code: 1006, reason: 'simulated-disconnect' });

  assert.deepEqual(orphaned, [player]);
  assert.equal(player.node, node);
  assert.equal(player.destroyed, false);
});

test('a recovered player is not reported as orphaned after node disconnect', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const { Node } = require('../dist');
  const { NodeState } = require('../dist/src/typings/types.js');
  const destination = new Node(manager, {
    identifier: 'disconnect-destination', host: '127.0.0.1', port: 2555, password: 'test-only',
  });
  destination.connected = true;
  destination.state = NodeState.READY;
  manager.nodes.nodes.set(destination.identifier, destination);
  t.after(async () => { await destination.destroy(); });
  const originalMove = NodeFailover.move;
  NodeFailover.move = async () => {
    player.node = destination;
    return { status: 'recovered', attempts: 1, node: destination };
  };
  t.after(() => { NodeFailover.move = originalMove; });
  manager.options.node = { ...manager.options.node, autoMovePlayers: true };
  source.retryAmount = 0;
  source.reconnectAttempts = 0;
  const orphaned = [];
  manager.on('playersOrphaned', players => orphaned.push(...players));

  await source.close({ code: 1006, reason: 'simulated-disconnect' });

  assert.deepEqual(orphaned, []);
  assert.equal(player.node, destination);
  assert.equal(player.destroyed, false);
});

test('duplicate close notifications run only one failover and one disconnect event', async t => {
  const { manager, node } = createPlayer(t);
  const originalMove = NodeFailover.move;
  let signalStarted;
  let releaseMove;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const release = new Promise(resolve => { releaseMove = resolve; });
  let moveCalls = 0;
  NodeFailover.move = async () => {
    moveCalls++;
    signalStarted();
    await release;
    return { status: 'cancelled', attempts: 0 };
  };
  t.after(() => { NodeFailover.move = originalMove; });
  manager.options.node = {
    ...manager.options.node,
    autoMovePlayers: true,
    failover: { preserveOnFailure: true },
  };
  node.retryAmount = 0;
  node.reconnectAttempts = 0;
  let disconnectEvents = 0;
  manager.on('nodeDisconnect', () => { disconnectEvents++; });

  const first = node.close({ code: 1006, reason: 'first-close' });
  try {
    await started;
    await node.close({ code: 1006, reason: 'duplicate-close' });
  } finally {
    releaseMove();
  }
  await first;
  assert.equal(moveCalls, 1);
  assert.equal(disconnectEvents, 1);
});

test('reconnected node is not destroyed by an earlier pending close', async t => {
  const { manager, node } = createPlayer(t);
  const { NodeState } = require('../dist/src/typings/types.js');
  const originalMove = NodeFailover.move;
  let signalStarted;
  let releaseMove;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const release = new Promise(resolve => { releaseMove = resolve; });
  NodeFailover.move = async () => {
    signalStarted();
    await release;
    return { status: 'cancelled', attempts: 0 };
  };
  t.after(() => { NodeFailover.move = originalMove; });
  manager.options.node = { ...manager.options.node, autoMovePlayers: true };
  node.retryAmount = 0;
  node.reconnectAttempts = 0;
  let destroyedEvents = 0;
  manager.on('nodeDestroy', () => destroyedEvents++);

  const closing = node.close({ code: 1006, reason: 'old-connection' });
  try {
    await started;
    // Simulate a new ready connection while the old failover is pending.
    node.connected = true;
    node.state = NodeState.READY;
  } finally {
    releaseMove();
  }
  await closing;
  assert.equal(node.connected, true);
  assert.equal(node.state, NodeState.READY);
  assert.equal(node.destroyed, false);
  assert.equal(destroyedEvents, 0);
});

test('false recovered result cannot hide a player still on disconnected source', async t => {
  const { manager, node, player } = createPlayer(t);
  const originalMove = NodeFailover.move;
  NodeFailover.move = async () => ({
    status: 'recovered', attempts: 1, node,
  });
  t.after(() => { NodeFailover.move = originalMove; });
  manager.options.node = {
    ...manager.options.node,
    autoMovePlayers: true,
    failover: { preserveOnFailure: true },
  };
  node.retryAmount = 0;
  node.reconnectAttempts = 0;
  const orphaned = [];
  const moved = [];
  manager.on('playersOrphaned', players => orphaned.push(...players));
  manager.on('playersMoved', players => moved.push(...players));

  await node.close({ code: 1006, reason: 'incorrect-recovered-result' });

  assert.deepEqual(orphaned, [player]);
  assert.deepEqual(moved, []);
  assert.equal(player.node, node);
  assert.equal(player.destroyed, false);
});

test('recovered result targeting an unconnected node is not reported as moved', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const { Node } = require('../dist');
  const destination = new Node(manager, {
    identifier: 'disconnected-target', host: '127.0.0.1', port: 2666, password: 'test-only',
  });
  destination.connected = false;
  manager.nodes.nodes.set(destination.identifier, destination);
  t.after(async () => { await destination.destroy(); });
  const originalMove = NodeFailover.move;
  NodeFailover.move = async () => {
    player.node = destination;
    return { status: 'recovered', attempts: 1, node: destination };
  };
  t.after(() => { NodeFailover.move = originalMove; });
  manager.options.node = { ...manager.options.node, autoMovePlayers: true };
  source.retryAmount = 0;
  source.reconnectAttempts = 0;
  const moved = [];
  manager.on('playersMoved', players => moved.push(...players));

  await source.close({ code: 1006, reason: 'destination-not-connected' });

  assert.deepEqual(moved, []);
  assert.equal(player.node, destination);
});

test('one rejected failover does not block recovery of other guilds', async t => {
  const { manager, node: source, player: first } = createPlayer(t);
  const { Node, Player } = require('../dist');
  const { NodeState } = require('../dist/src/typings/types.js');
  const second = new Player(manager, source, {
    guildId: '123456789012345679',
    voiceChannelId: '223456789012345679',
    autoPlay: false,
  });
  second.stopHealthCheck();
  manager.players.players.set(second.guildId, second);
  t.after(() => second.stopHealthCheck());

  const destination = new Node(manager, {
    identifier: 'partial-failover-destination', host: '127.0.0.1',
    port: 2777, password: 'test-only',
  });
  destination.connected = true;
  destination.state = NodeState.READY;
  manager.nodes.nodes.set(destination.identifier, destination);
  t.after(async () => { await destination.destroy(); });

  const originalMove = NodeFailover.move;
  NodeFailover.move = async player => {
    if (player === first) throw new Error('simulated failover exception');
    player.node = destination;
    return { status: 'recovered', attempts: 1, node: destination };
  };
  t.after(() => { NodeFailover.move = originalMove; });

  manager.options.node = {
    ...manager.options.node,
    autoMovePlayers: true,
    failover: { preserveOnFailure: true },
  };
  source.retryAmount = 0;
  source.reconnectAttempts = 0;
  const orphaned = [];
  const moved = [];
  const errors = [];
  manager.on('playersOrphaned', players => orphaned.push(...players));
  manager.on('playersMoved', players => moved.push(...players));
  manager.on('nodeError', (_node, error) => errors.push(error));

  await source.close({ code: 1006, reason: 'partial-recovery-error' });
  assert.deepEqual(orphaned, [first]);
  assert.deepEqual(moved, [second]);
  assert.equal(second.node, destination);
  assert.equal(first.node, source);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /simulated failover exception/);
});
