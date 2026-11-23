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
  const orphaned = [];
  manager.options.node.failover = { preserveOnFailure: true };
  manager.on('playersMoved', players => moved.push(...players));
  manager.on('playersOrphaned', players => orphaned.push(...players));

  await source.close({ code: 1006, reason: 'destination-not-connected' });

  assert.deepEqual(moved, []);
  assert.deepEqual(orphaned, [player], 'failed destination must not silently disappear');
  assert.equal(player.node, destination);
  assert.equal(player.destroyed, false);
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

test('permanent disconnect cleans other guilds even if one player destroy throws', async t => {
  const { manager, node: source, player: first } = createPlayer(t);
  const { Player } = require('../dist');
  const second = new Player(manager, source, {
    guildId: '123456789012345679',
    voiceChannelId: '223456789012345679',
    autoPlay: false,
  });
  second.stopHealthCheck();
  manager.players.players.set(second.guildId, second);
  t.after(() => second.stopHealthCheck());
  manager.options.node = {
    ...manager.options.node,
    autoMovePlayers: false,
    failover: { preserveOnFailure: false },
  };
  source.retryAmount = 0;
  source.reconnectAttempts = 0;
  const destroyed = [];
  const orphaned = [];
  const errors = [];
  first.destroy = async () => {
    destroyed.push('first');
    throw new Error('first guild database unavailable');
  };
  second.destroy = async () => { destroyed.push('second'); };
  manager.on('nodeError', (_node, error) => errors.push(error));
  manager.on('playersOrphaned', players => orphaned.push(...players));

  await source.close({ code: 1006, reason: 'permanent-disconnect' });

  assert.deepEqual(destroyed, ['first', 'second']);
  assert.deepEqual(orphaned, [first, second]);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /database unavailable/);
  assert.equal(source.destroyed, true);
});

test('old disconnect cannot destroy a node reconnected during orphan cleanup', async t => {
  const { manager, node, player } = createPlayer(t);
  const { NodeState } = require('../dist/src/typings/types.js');
  manager.options.node = {
    ...manager.options.node,
    autoMovePlayers: false,
    failover: { preserveOnFailure: false },
  };
  node.retryAmount = 0;
  node.reconnectAttempts = 0;
  let enteredResolve;
  let releaseResolve;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  const release = new Promise(resolve => { releaseResolve = resolve; });
  player.destroy = async () => {
    enteredResolve();
    await release;
  };

  const closing = node.close({ code: 1006, reason: 'old-close-cleanup' });
  try {
    await entered;
    // The original callback is still waiting on guild cleanup.
    node.connected = true;
    node.state = NodeState.READY;
  } finally {
    releaseResolve();
  }
  await closing;
  assert.equal(node.destroyed, false);
  assert.equal(node.connected, true);
  assert.equal(node.state, NodeState.READY);
});

test('throwing disconnect and orphan observers do not block node cleanup', async t => {
  const { manager, node, player } = createPlayer(t);
  manager.options.node = {
    ...manager.options.node,
    autoMovePlayers: false,
    failover: { preserveOnFailure: true },
  };
  node.retryAmount = 0;
  node.reconnectAttempts = 0;
  const errors = [];
  const events = [];
  manager.on('nodeError', (_node, error) => errors.push(error.message));
  manager.on('nodeDisconnect', () => {
    events.push('disconnect');
    throw new Error('disconnect subscriber failed');
  });
  manager.on('playersOrphaned', players => {
    events.push('orphaned');
    assert.deepEqual(players, [player]);
    throw new Error('orphan subscriber failed');
  });

  await node.close({ code: 1006, reason: 'subscribers-throw' });
  assert.equal(node.destroyed, true);
  assert.deepEqual(events, ['disconnect', 'orphaned']);
  assert.deepEqual(errors, ['disconnect subscriber failed', 'orphan subscriber failed']);
});

test('throwing playersMoved subscriber cannot abort node closure', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const { Node } = require('../dist');
  const { NodeState } = require('../dist/src/typings/types.js');
  const destination = new Node(manager, {
    identifier: 'observer-throw-destination',
    host: '127.0.0.1', port: 2888, password: 'test-only',
  });
  destination.connected = true;
  destination.state = NodeState.READY;
  manager.nodes.nodes.set(destination.identifier, destination);
  t.after(async () => { await destination.destroy(); });
  const move = NodeFailover.move;
  NodeFailover.move = async () => {
    player.node = destination;
    return { status: 'recovered', attempts: 1, node: destination };
  };
  t.after(() => { NodeFailover.move = move; });
  manager.options.node = { ...manager.options.node, autoMovePlayers: true };
  source.retryAmount = 0;
  source.reconnectAttempts = 0;
  const errors = [];
  manager.on('nodeError', (_node, error) => errors.push(error.message));
  manager.on('playersMoved', () => { throw new Error('move subscriber failed'); });

  await source.close({ code: 1006, reason: 'move-subscriber-throws' });
  assert.equal(source.destroyed, true);
  assert.equal(player.node, destination);
  assert.deepEqual(errors, ['move subscriber failed']);
});

test('two node instances sharing one endpoint do not share orphaned players', async t => {
  const { manager, node: source, player: first } = createPlayer(t);
  const { Node, Player, NodeState } = require('../dist');
  const peer = new Node(manager, {
    identifier: 'same-endpoint-peer', host: source.host, port: source.port,
    password: 'test-only',
  });
  peer.connected = true;
  peer.state = NodeState.READY;
  manager.nodes.nodes.set(peer.identifier, peer);
  t.after(async () => { await peer.destroy(); });
  assert.equal(peer.uuid, source.uuid, 'the endpoint-based UUID intentionally collides');

  const second = new Player(manager, peer, {
    guildId: '123456789012345679',
    voiceChannelId: '223456789012345679',
    autoPlay: false,
  });
  second.stopHealthCheck();
  manager.players.players.set(second.guildId, second);
  t.after(() => second.stopHealthCheck());

  manager.options.node = {
    ...manager.options.node,
    autoMovePlayers: false,
    failover: { preserveOnFailure: true },
  };
  source.retryAmount = 0;
  source.reconnectAttempts = 0;
  const orphans = [];
  manager.on('playersOrphaned', players => orphans.push(...players));
  await source.close({ code: 1006, reason: 'same-host-independent-node' });

  assert.deepEqual(orphans, [first]);
  assert.equal(second.node, peer);
  assert.equal(second.destroyed, false);
  assert.equal(peer.destroyed, false);
});

test('disaster recovery only restarts players owned by the exact node', async t => {
  const { manager, node: source, player: first } = createPlayer(t);
  const { Node, Player, NodeState } = require('../dist');
  const peer = new Node(manager, {
    identifier: 'same-endpoint-recovery-peer',
    host: source.host, port: source.port, password: 'test-only',
  });
  peer.connected = true;
  peer.state = NodeState.READY;
  manager.nodes.nodes.set(peer.identifier, peer);
  t.after(async () => { await peer.destroy(); });
  const second = new Player(manager, peer, {
    guildId: '123456789012345679',
    voiceChannelId: '223456789012345679',
    autoPlay: false,
  });
  second.stopHealthCheck();
  manager.players.players.set(second.guildId, second);
  t.after(() => second.stopHealthCheck());
  assert.equal(peer.uuid, source.uuid);

  const restarts = [];
  first.restart = async () => { restarts.push('first'); return true; };
  second.restart = async () => { restarts.push('second'); return true; };
  await source.startDisasterRecovery('test-identity-scope');

  assert.deepEqual(restarts, ['first']);
  assert.equal(second.node, peer);
});

test('observer exceptions during disaster recovery never fabricate restart failures', async t => {
  const { manager, node, player } = createPlayer(t);
  let starts = 0;
  let successes = 0;
  let failures = 0;
  let restarts = 0;
  const errors = [];
  player.restart = async () => { restarts++; return true; };
  manager.on('nodeError', (_node, error) => errors.push(error.message));
  manager.on('playerRecoveryStarted', () => {
    starts++;
    throw new Error('start observer failed');
  });
  manager.on('playerRecoverySuccess', () => {
    successes++;
    throw new Error('success observer failed');
  });
  manager.on('playerRecoveryFailed', () => failures++);

  await node.startDisasterRecovery('throwing-observer-regression');
  assert.equal(restarts, 1);
  assert.equal(starts, 1);
  assert.equal(successes, 1);
  assert.equal(failures, 0);
  assert.deepEqual(errors, ['start observer failed', 'success observer failed']);
});

test('a rejected restart does not interrupt recovery of a separate guild', async t => {
  const { manager, node, player: first } = createPlayer(t);
  const { Player } = require('../dist');
  const second = new Player(manager, node, {
    guildId: '123456789012345679',
    voiceChannelId: '223456789012345679',
    autoPlay: false,
  });
  second.stopHealthCheck();
  manager.players.players.set(second.guildId, second);
  t.after(() => second.stopHealthCheck());
  first.restart = async () => { throw new Error('first restart rejected'); };
  let secondRestarts = 0;
  second.restart = async () => { secondRestarts++; return true; };

  const successes = [];
  const failures = [];
  const errors = [];
  manager.on('nodeError', (_node, error) => errors.push(error.message));
  manager.on('playerRecoverySuccess', player => successes.push(player));
  manager.on('playerRecoveryFailed', player => failures.push(player));
  await node.startDisasterRecovery('mixed-success-failure');

  assert.equal(secondRestarts, 1);
  assert.deepEqual(successes, [second]);
  assert.deepEqual(failures, [first]);
  assert.deepEqual(errors, ['first restart rejected']);
});

test('recovery completion cannot report success after player changes node ownership', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const { Node, NodeState } = require('../dist');
  const next = new Node(manager, {
    identifier: 'replacement-owner', host: '127.0.0.1',
    port: 2999, password: 'test-only',
  });
  next.connected = true;
  next.state = NodeState.READY;
  manager.nodes.nodes.set(next.identifier, next);
  t.after(async () => { await next.destroy(); });
  let enteredResolve;
  let resumeResolve;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  const resume = new Promise(resolve => { resumeResolve = resolve; });
  player.restart = async () => {
    enteredResolve();
    await resume;
    return true;
  };
  const successes = [];
  const failures = [];
  manager.on('playerRecoverySuccess', current => successes.push(current));
  manager.on('playerRecoveryFailed', current => failures.push(current));

  const recovering = source.startDisasterRecovery('owner-replaced');
  try {
    await entered;
    player.node = next;
  } finally {
    resumeResolve();
  }
  await recovering;
  assert.deepEqual(successes, []);
  assert.deepEqual(failures, []);
  assert.equal(player.node, next);
});

test('disconnect listener cannot cause old close to terminate replacement socket', async t => {
  const { manager, node } = createPlayer(t);
  const { NodeState } = require('../dist/src/typings/types.js');
  const closed = [];
  const oldSocket = { close: () => closed.push('old') };
  const newSocket = { close: () => closed.push('new') };
  node.socket = oldSocket;
  manager.on('nodeDisconnect', () => {
    node.socket = newSocket;
    node.connected = true;
    node.state = NodeState.READY;
  });
  node.retryAmount = 0;

  await node.close({ code: 1006, reason: 'replacement-socket-registered' });
  assert.deepEqual(closed, ['old']);
  assert.equal(node.socket, newSocket);
  assert.equal(node.connected, true);
  assert.equal(node.state, NodeState.READY);
  assert.equal(node.destroyed, false);
  // The fixture cleanup invokes node.destroy(), which may close the replacement.
});

test('throwing nodeStateChange listener does not skip disconnect policy', async t => {
  const { manager, node } = createPlayer(t);
  const errors = [], orphaned = [];
  manager.options.node = {
    ...manager.options.node,
    autoMovePlayers: false,
    failover: { preserveOnFailure: true },
  };
  node.retryAmount = 0;
  node.reconnectAttempts = 0;
  manager.on('nodeError', (_node, error) => errors.push(error.message));
  manager.on('nodeStateChange', (_node, _previous, next) => {
    if (next === require('../dist/src/typings/types.js').NodeState.DISCONNECTED) {
      throw new Error('node state observer crashed');
    }
  });
  manager.on('playersOrphaned', players => orphaned.push(...players));

  await node.close({ code: 1006, reason: 'state-change-listener-throws' });
  assert.equal(node.destroyed, true);
  assert.equal(orphaned.length, 1);
  assert.deepEqual(errors, ['node state observer crashed']);
});

test('legacy session is readable only when no other node shares the endpoint', async t => {
  const { manager, node } = createPlayer(t);
  const legacyKey = `nodes.${node.uuid}`;
  await manager.database.set(legacyKey, { sessionId: 'legacy-session' });
  assert.equal(await node.loadStoredSessionId(), 'legacy-session');

  const { Node } = require('../dist');
  const peer = new Node(manager, {
    identifier: 'same-endpoint-session-peer', host: node.host,
    port: node.port, password: 'test-only',
  });
  manager.nodes.nodes.set(peer.identifier, peer);
  t.after(async () => { await peer.destroy(); });
  assert.equal(peer.uuid, node.uuid);
  assert.equal(await node.loadStoredSessionId(), undefined);
  assert.equal(await peer.loadStoredSessionId(), undefined);
});

test('scoped sessions stay independent for nodes using the same endpoint', async t => {
  const { manager, node } = createPlayer(t);
  const { Node } = require('../dist');
  const { generateUUID } = require('../dist/src/Util.js');
  const peer = new Node(manager, {
    identifier: 'second-session-owner', host: node.host,
    port: node.port, password: 'test-only',
  });
  manager.nodes.nodes.set(peer.identifier, peer);
  t.after(async () => { await peer.destroy(); });
  const firstKey = `nodes.${node.uuid}.sessions.${generateUUID(node.identifier, 0)}`;
  const secondKey = `nodes.${peer.uuid}.sessions.${generateUUID(peer.identifier, 0)}`;
  assert.notEqual(firstKey, secondKey);
  await manager.database.set(firstKey, { sessionId: 'source-session' });
  await manager.database.set(secondKey, { sessionId: 'peer-session' });
  assert.equal(await node.loadStoredSessionId(), 'source-session');
  assert.equal(await peer.loadStoredSessionId(), 'peer-session');
  await manager.database.set(`nodes.${node.uuid}`, {
    ...(await manager.database.get(`nodes.${node.uuid}`)),
    sessionId: 'stale-legacy-session',
  });
  assert.equal(await node.loadStoredSessionId(), 'source-session');
  assert.equal(await peer.loadStoredSessionId(), 'peer-session');
});

test('ready payload persists to scoped session key rather than overwriting legacy owner', async t => {
  const { manager, node } = createPlayer(t);
  const { NodeState } = require('../dist/src/typings/types.js');
  const { generateUUID } = require('../dist/src/Util.js');
  manager.options.resume = false;
  await manager.database.set(`nodes.${node.uuid}`, { sessionId: 'legacy-stays' });
  node.socket = { close() {} };
  node.connected = true;
  node.state = NodeState.CONNECTED;
  await node.message({
    data: JSON.stringify({ op: 'ready', sessionId: 'new-owner-session', resumed: false }),
  });

  const scoped = `nodes.${node.uuid}.sessions.${generateUUID(node.identifier, 0)}`;
  assert.equal((await manager.database.get(scoped)).sessionId, 'new-owner-session');
  assert.equal((await manager.database.get(`nodes.${node.uuid}`)).sessionId, 'legacy-stays');
});
