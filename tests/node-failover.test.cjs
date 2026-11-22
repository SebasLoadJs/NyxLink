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
