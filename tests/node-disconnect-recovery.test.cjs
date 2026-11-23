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
