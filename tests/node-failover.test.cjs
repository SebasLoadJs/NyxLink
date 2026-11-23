const test = require('node:test');
const assert = require('node:assert/strict');
const { Node } = require('../dist');
const { NodeState } = require('../dist/src/typings/types');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

function candidates(manager) {
  return ['first', 'second'].map((identifier, index) => {
    const node = new Node(manager, { identifier, host: '127.0.0.1', port: 2440 + index, password: 'test', secure: false });
    node.connected = true;
    node.state = NodeState.READY;
    node.rest.destroyPlayer = async () => {};
    manager.nodes.nodes.set(identifier, node);
    return node;
  });
}

test('bounded failover tries a different node after a failed restore and preserves the player snapshot', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  const [first, second] = candidates(manager);
  first.rest.updatePlayer = async () => { throw new Error('restore failed'); };
  second.rest.updatePlayer = async (_guild, payload) => payload;
  player.voice.connect = async () => {};
  player.current = createTrack('current');
  player.current.position = 45000;
  player.playing = true;
  player.paused = true;
  player.volume = 60;
  const queued = createTrack('queued');
  player.queue.add(queued);
  const result = await NodeFailover.move(player, source);
  assert.equal(result.status, 'recovered');
  assert.equal(result.attempts, 2);
  assert.equal(player.node, second);
  assert.deepEqual(player.queue.tracks, [queued]);
  assert.equal(player.current.position, 45000);
  assert.equal(player.paused, true);
  assert.equal(player.volume, 60);
});

test('the failover attempt limit is enforced without destroying the player snapshot', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  const [first, second] = candidates(manager);
  let secondRequests = 0;
  first.rest.updatePlayer = async () => { throw new Error('restore failed'); };
  second.rest.updatePlayer = async () => { secondRequests++; return {}; };
  player.voice.connect = async () => {};
  player.current = createTrack('current');
  const result = await NodeFailover.move(player, source, { maxAttempts: 1 });
  assert.equal(result.status, 'failed');
  assert.equal(result.attempts, 1);
  assert.equal(secondRequests, 0);
  assert.equal(player.destroyed, false);
  assert.equal(player.current.identifier, 'current');
});

test('new user stop cancels failover before another candidate is attempted', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  const [first, second] = candidates(manager);
  const started = deferred();
  const release = deferred();
  let secondRequests = 0;
  first.rest.updatePlayer = async (_guild, payload) => {
    if (payload.track?.encoded) { started.resolve(); await release.promise; throw new Error('restore failed'); }
    return payload;
  };
  second.rest.updatePlayer = async () => { secondRequests++; return {}; };
  player.voice.connect = async () => {};
  player.current = createTrack('current');
  const moving = NodeFailover.move(player, source);
  await started.promise;
  const stopping = player.stop();
  release.resolve();
  await stopping;
  assert.equal((await moving).status, 'cancelled');
  assert.equal(secondRequests, 0);
  assert.equal(player.current, null);
});

test('concurrent failover requests share one bounded recovery', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  const [first] = candidates(manager);
  let transfers = 0;
  player.transferNode = async target => { transfers++; player.node = target; return true; };
  const results = await Promise.all([NodeFailover.move(player, source), NodeFailover.move(player, source)]);
  assert.equal(transfers, 1);
  assert.ok(results.every(result => result.status === 'recovered'));
  assert.equal(player.node, first);
});

for (const preserveOnFailure of [true, false]) {
  test(`eject without destinations respects preserveOnFailure=${preserveOnFailure}`, async t => {
    const { manager, node, player } = createPlayer(t);
    manager.options.node = { failover: { preserveOnFailure } };
    const queued = createTrack('queued');
    player.queue.add(queued);
    let orphaned;
    manager.on('playersOrphaned', players => { orphaned = players; });
    assert.equal(await manager.nodes.eject(node.identifier), true);
    assert.equal(player.destroyed, !preserveOnFailure);
    assert.deepEqual(orphaned, [player]);
    assert.equal(manager.nodes.nodes.has(node.identifier), false);
    if (preserveOnFailure) assert.deepEqual(player.queue.tracks, [queued]);
  });
}


test('eject blocks new assignments and coalesces concurrent requests', async t => {
  const {manager,node:source,player} = createPlayer(t);
  const [target] = candidates(manager);
  const entered = deferred(), release = deferred();
  let transfers = 0;
  player.transferNode = async destination => { transfers++; entered.resolve(); await release.promise; player.node = destination; return true; };
  const first = manager.nodes.eject(source.identifier);
  assert.equal(source.draining,true);
  assert.equal(manager.nodes.findNode(),target);
  await entered.promise;
  const second = manager.nodes.eject(source.identifier);
  assert.equal(manager.nodes.setDraining(source.identifier,false),false);
  release.resolve();
  assert.deepEqual(await Promise.all([first,second]),[true,true]);
  assert.equal(transfers,1);
});

test('cancelled evacuation leaves the source available for explicit recovery rather than orphaning newer playback', async t => {
  const {manager,node:source,player} = createPlayer(t);
  candidates(manager);
  const {playbackGuard} = require('../dist/src/players/PlaybackGuard');
  const entered = deferred(), release = deferred();
  player.transferNode = async () => { playbackGuard(player).invalidate(); entered.resolve(); await release.promise; return false; };
  const ejecting = manager.nodes.eject(source.identifier);
  await entered.promise;
  playbackGuard(player).invalidate();
  release.resolve();
  assert.equal(await ejecting,false);
  assert.equal(source.destroyed,false);
  assert.equal(player.destroyed,false);
  assert.equal(manager.nodes.nodes.get(source.identifier),source);
});

test('cancellation during the last failover backoff is not reported as failure', async t => {
  const {NodeFailover} = require('../dist/src/nodes/NodeFailover');
  const {playbackGuard} = require('../dist/src/players/PlaybackGuard');
  const {manager,node:source,player} = createPlayer(t);
  const [target, second] = candidates(manager);
  manager.nodes.nodes.delete(second.identifier);
  t.mock.timers.enable({apis:['setTimeout']});
  player.transferNode = async () => false;
  let failures=0; manager.on('playerRecoveryFailed',()=>failures++);
  const moving=NodeFailover.move(player,source,{maxAttempts:2,retryDelayMs:100});
  await new Promise(resolve=>setImmediate(resolve));
  playbackGuard(player).invalidate();
  t.mock.timers.tick(100);
  assert.equal((await moving).status,'cancelled');
  assert.equal(failures,0);
});

test('players cannot migrate to a node belonging to another manager', async t => {
  const {player,node} = createPlayer(t);
  const foreign = createPlayer(t);
  foreign.node.identifier = 'foreign';
  assert.equal(await player.transferNode(foreign.node),false);
  assert.equal(player.node,node);
});

test('failover retries another candidate when the acknowledged target disconnects', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { playbackGuard } = require('../dist/src/players/PlaybackGuard');
  const { manager, node: source, player } = createPlayer(t);
  const [first, second] = candidates(manager);
  const visited = [];
  player.transferNode = async target => {
    playbackGuard(player).invalidate();
    visited.push(target.identifier);
    player.node = target;
    if (target === first) {
      first.connected = false;
      first.state = NodeState.DISCONNECTED;
    }
    return true;
  };

  const result = await NodeFailover.move(player, source, { maxAttempts: 2, retryDelayMs: 0 });
  assert.equal(result.status, 'recovered');
  assert.equal(result.attempts, 2);
  assert.equal(result.node, second);
  assert.equal(player.node, second);
  assert.deepEqual(visited, ['first', 'second']);
});

test('no alternate candidate reports failed after a target disconnects post-ACK', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { playbackGuard } = require('../dist/src/players/PlaybackGuard');
  const { manager, node: source, player } = createPlayer(t);
  const [first, second] = candidates(manager);
  manager.nodes.nodes.delete(second.identifier);
  let failures = 0;
  manager.on('playerRecoveryFailed', () => failures++);
  player.transferNode = async target => {
    playbackGuard(player).invalidate();
    player.node = target;
    target.connected = false;
    target.state = NodeState.DISCONNECTED;
    return true;
  };

  const result = await NodeFailover.move(player, source, { maxAttempts: 2, retryDelayMs: 0 });
  assert.equal(result.status, 'failed');
  assert.equal(result.attempts, 1);
  assert.equal(failures, 1);
  assert.equal(player.node, first);
  assert.equal(first.connected, false);
});

test('eject isolates a failed guild migration and still evacuates a peer', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { Player } = require('../dist');
  const { manager, node: source, player: first } = createPlayer(t);
  const [target] = candidates(manager);
  const second = new Player(manager, source, {
    guildId: '123456789012345679',
    voiceChannelId: '223456789012345679',
    autoPlay: false,
  });
  second.stopHealthCheck();
  manager.players.players.set(second.guildId, second);
  t.after(() => second.stopHealthCheck());

  const originalMove = NodeFailover.move;
  NodeFailover.move = async player => {
    if (player === first) throw new Error('first migration rejected');
    player.node = target;
    return { status: 'recovered', attempts: 1, node: target };
  };
  t.after(() => { NodeFailover.move = originalMove; });
  manager.options.node = { ...manager.options.node, failover: { preserveOnFailure: true } };
  const orphans = [], errors = [];
  manager.on('playersOrphaned', players => orphans.push(...players));
  manager.on('nodeError', (_node, error) => errors.push(error.message));

  assert.equal(await manager.nodes.eject(source.identifier), true);
  assert.equal(manager.nodes.nodes.has(source.identifier), false);
  assert.equal(source.destroyed, true);
  assert.equal(second.node, target);
  assert.deepEqual(orphans, [first]);
  assert.deepEqual(errors, ['first migration rejected']);
});

test('eject leaves node registered if an orphan destroy fails', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { Player } = require('../dist');
  const { manager, node: source, player: first } = createPlayer(t);
  const second = new Player(manager, source, {
    guildId: '123456789012345679',
    voiceChannelId: '223456789012345679',
    autoPlay: false,
  });
  second.stopHealthCheck();
  manager.players.players.set(second.guildId, second);
  t.after(() => second.stopHealthCheck());

  const originalMove = NodeFailover.move;
  NodeFailover.move = async () => ({ status: 'failed', attempts: 1 });
  t.after(() => { NodeFailover.move = originalMove; });
  manager.options.node = { ...manager.options.node, failover: { preserveOnFailure: false } };
  const cleaned = [], errors = [];
  first.destroy = async () => {
    cleaned.push('first');
    throw new Error('first destroy unavailable');
  };
  second.destroy = async () => { cleaned.push('second'); };
  manager.on('nodeError', (_node, error) => errors.push(error.message));

  assert.equal(await manager.nodes.eject(source.identifier), false);
  assert.deepEqual(cleaned, ['first', 'second']);
  assert.deepEqual(errors, ['first destroy unavailable']);
  assert.equal(source.destroyed, false);
  assert.equal(manager.nodes.nodes.get(source.identifier), source);
  assert.equal(source.draining, true);
});

test('eject reports a player stranded on an already disconnected destination', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  const [failedTarget] = candidates(manager);
  failedTarget.connected = false;
  failedTarget.state = NodeState.DISCONNECTED;
  const originalMove = NodeFailover.move;
  NodeFailover.move = async () => {
    player.node = failedTarget;
    return { status: 'failed', attempts: 1 };
  };
  t.after(() => { NodeFailover.move = originalMove; });
  manager.options.node = {
    ...manager.options.node,
    failover: { preserveOnFailure: true },
  };
  const orphans = [];
  manager.on('playersOrphaned', players => orphans.push(...players));

  assert.equal(await manager.nodes.eject(source.identifier), true);
  assert.deepEqual(orphans, [player]);
  assert.equal(player.node, failedTarget);
  assert.equal(player.destroyed, false);
});

test('drain rejects a recovery ACK that leaves the player on the source', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  candidates(manager);
  const original = NodeFailover.move;
  NodeFailover.move = async () => ({ status: 'recovered', attempts: 1, node: source });
  t.after(() => { NodeFailover.move = original; });

  assert.equal(await manager.nodes.drain(source.identifier), false);
  assert.equal(player.node, source);
  assert.equal(source.draining, true);
});

test('drain verifies actual ownership and succeeds on a live registered target', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  const [target] = candidates(manager);
  const original = NodeFailover.move;
  NodeFailover.move = async () => {
    player.node = target;
    return { status: 'recovered', attempts: 1, node: target };
  };
  t.after(() => { NodeFailover.move = original; });

  assert.equal(await manager.nodes.drain(source.identifier), true);
  assert.equal(player.node, target);
  assert.equal(source.destroyed, false);
});

test('drain cannot succeed when the destination is not registered', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  const [target] = candidates(manager);
  manager.nodes.nodes.delete(target.identifier);
  const original = NodeFailover.move;
  NodeFailover.move = async () => {
    player.node = target;
    return { status: 'recovered', attempts: 1, node: target };
  };
  t.after(() => { NodeFailover.move = original; });

  assert.equal(await manager.nodes.drain(source.identifier), false);
  assert.equal(player.node, target);
});

test('eject treats false recovery on original owner as an orphan', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  candidates(manager);
  const original = NodeFailover.move;
  NodeFailover.move = async () => ({ status: 'recovered', attempts: 1, node: source });
  t.after(() => { NodeFailover.move = original; });
  manager.options.node = { ...manager.options.node, failover: { preserveOnFailure: false } };
  const orphaned = [];
  manager.on('playersOrphaned', players => orphaned.push(...players));

  assert.equal(await manager.nodes.eject(source.identifier), true);
  assert.deepEqual(orphaned, [player]);
  assert.equal(player.destroyed, true);
});

test('eject does not delete source when stranded destination cleanup rejects', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  const [target] = candidates(manager);
  target.connected = false;
  target.state = NodeState.DISCONNECTED;
  const original = NodeFailover.move;
  NodeFailover.move = async () => {
    player.node = target;
    return { status: 'failed', attempts: 1 };
  };
  t.after(() => { NodeFailover.move = original; });
  manager.options.node = { ...manager.options.node, failover: { preserveOnFailure: false } };
  let attempts = 0;
  player.destroy = async () => {
    attempts++;
    throw new Error('offline destination refuses deletion');
  };
  const errors = [];
  manager.on('nodeError', (_node, error) => errors.push(error.message));

  assert.equal(await manager.nodes.eject(source.identifier), false);
  assert.equal(attempts, 1);
  assert.equal(source.destroyed, false);
  assert.equal(manager.nodes.nodes.get(source.identifier), source);
  assert.deepEqual(errors, ['offline destination refuses deletion']);
});

test('eject preserves source when recovered ACK points to an unregistered live owner', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  const [target] = candidates(manager);
  manager.nodes.nodes.delete(target.identifier);
  const original = NodeFailover.move;
  NodeFailover.move = async () => {
    player.node = target;
    return { status: 'recovered', attempts: 1, node: target };
  };
  t.after(() => { NodeFailover.move = original; });
  manager.options.node = { ...manager.options.node, failover: { preserveOnFailure: false } };
  let destroyCalls = 0;
  player.destroy = async () => { destroyCalls++; };

  assert.equal(await manager.nodes.eject(source.identifier), false);
  assert.equal(destroyCalls, 0);
  assert.equal(source.destroyed, false);
  assert.equal(manager.nodes.nodes.get(source.identifier), source);
});

test('cancelled eject does not destroy newer intent on a connecting target', async t => {
  const { NodeFailover } = require('../dist/src/nodes/NodeFailover');
  const { manager, node: source, player } = createPlayer(t);
  const [target] = candidates(manager);
  target.connected = false;
  target.state = NodeState.CONNECTING;
  const originalMove = NodeFailover.move;
  NodeFailover.move = async () => {
    player.node = target;
    return { status: 'cancelled', attempts: 1 };
  };
  t.after(() => { NodeFailover.move = originalMove; });
  manager.options.node = {
    ...manager.options.node,
    failover: { preserveOnFailure: false },
  };
  let destroyCalls = 0;
  const originalDestroy = player.destroy.bind(player);
  player.destroy = async (...args) => {
    destroyCalls++;
    return originalDestroy(...args);
  };

  assert.equal(await manager.nodes.eject(source.identifier), false);
  assert.equal(destroyCalls, 0);
  assert.equal(player.node, target);
  assert.equal(player.destroyed, false);
  assert.equal(source.destroyed, false);
  assert.equal(manager.nodes.nodes.get(source.identifier), source);
});
