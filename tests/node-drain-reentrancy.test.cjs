const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, NodeState, NodeFailover } = require('../dist');
const { createPlayer, createTrack } = require('./helpers/player.cjs');

function destination(t, manager) {
  const target = new Node(manager, { identifier: 'target', host: '127.0.0.1', port: 2444, password: 'test', secure: false });
  target.connected = true;
  target.state = NodeState.READY;
  target.rest.destroyPlayer = async () => {};
  target.rest.updatePlayer = async (_guild, payload) => payload;
  manager.nodes.nodes.set(target.identifier, target);
  t.after(async () => { await target.destroy(); await manager.database.shutdown(); });
  return target;
}

test('synchronous failover listeners cannot re-enable a drain or start a second evacuation', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const target = destination(t, manager);
  player.voice.connect = async () => {};

  let migrations = 0;
  let nestedDrain;
  let reenabled;
  manager.on('playerNodeFailover', (_player, report) => {
    if (report.status !== 'in-progress') return;
    migrations++;
    if (migrations === 1) {
      reenabled = manager.nodes.setDraining(source.identifier, false);
      nestedDrain = manager.nodes.drain(source.identifier);
    }
  });

  const draining = manager.nodes.drain(source.identifier);
  assert.equal(await draining, true);
  assert.equal(await nestedDrain, true);
  assert.equal(reenabled, false);
  assert.equal(migrations, 1);
  assert.equal(source.draining, true);
  assert.equal(player.node, target);
});

test('a synchronous failover listener shares the recovery that emitted its notification', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const target = destination(t, manager);
  player.voice.connect = async () => {};
  let migrations = 0;
  let nestedRecovery;
  manager.on('playerNodeFailover', (_player, report) => {
    if (report.status !== 'in-progress') return;
    migrations++;
    if (migrations === 1) nestedRecovery = NodeFailover.move(player, source);
  });

  const recovering = NodeFailover.move(player, source);
  const result = await recovering;
  const nested = await nestedRecovery;
  assert.equal(result.status, 'recovered');
  assert.equal(nested.status, 'recovered');
  assert.equal(migrations, 1);
  assert.equal(player.node, target);
});

test('a stop before deferred recovery executes cannot be adopted as a new migration intent', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const target = destination(t, manager);
  player.voice.connect = async () => {};
  assert.equal(await player.play({ track: createTrack('accepted') }), true);
  const queued = createTrack('queued');
  player.queue.add(queued);
  let targetUpdates = 0;
  target.rest.updatePlayer = async (_guild, payload) => { targetUpdates++; return payload; };

  const recovering = NodeFailover.move(player, source);
  const stopping = player.stop();
  await stopping;
  assert.equal((await recovering).status, 'cancelled');
  assert.equal(targetUpdates, 0);
  assert.equal(player.node, source);
  assert.equal(player.current, null);
});
