const test = require('node:test');
const assert = require('node:assert/strict');
const { Node } = require('../dist');
const { NodeState } = require('../dist/src/typings/types');
const { playbackGuard } = require('../dist/src/players/PlaybackGuard');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

function newNode(manager) {
  const node = new Node(manager, {
    identifier: 'next-worker', host: '127.0.0.1', port: 2440,
    password: 'fixture-only', secure: false
  });
  node.connected = true;
  node.state = NodeState.READY;
  node.rest.updatePlayer = async (_guild, payload) => payload;
  node.rest.destroyPlayer = async () => {};
  manager.nodes.nodes.set(node.identifier, node);
  return node;
}

function workerFailure(player, affectedGuilds = [player.guildId]) {
  return { op: 'event', type: 'WorkerFailedEvent', affectedGuilds, message: 'untrusted-token-value' };
}

test('stale worker failure cannot disconnect a player already owned by a different node', async t => {
  const { node: source, manager, player } = createPlayer(t);
  const destination = newNode(manager);
  t.after(() => destination.destroy());
  player.node = destination;
  const events = [];
  player.disconnect = async () => { events.push('disconnect'); return player; };
  player.connect = async () => { events.push('connect'); return player; };
  player.restart = async () => { events.push('restart'); return true; };
  source.rest.destroyPlayer = async () => { events.push('remote-delete'); };
  const logs = [];
  manager.on('debug', value => logs.push(value));
  await source.message({ data: JSON.stringify(workerFailure(player)) });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, []);
  assert.equal(player.node, destination);
  assert.equal(player.destroyed, false);
  assert.equal(player.get('voiceCloseRecoveryInProgress'), undefined);
  assert.ok(logs.every(line => !line.includes('untrusted-token-value')));
});

test('user stop during worker disconnect cancels remote deletion and reconnect', async t => {
  const { node, player } = createPlayer(t);
  const entered = deferred();
  const release = deferred();
  const effects = [];
  player.current = createTrack('old');
  player.disconnect = async () => { effects.push('disconnect'); entered.resolve(); await release.promise; return player; };
  player.connect = async () => { effects.push('connect'); return player; };
  player.restart = async () => { effects.push('restart'); return true; };
  node.rest.destroyPlayer = async () => { effects.push('remote-delete'); };
  const handling = node.handleWorkerFailed(workerFailure(player));
  await entered.promise;
  const stopping = player.stop();
  release.resolve();
  await stopping;
  await handling;
  assert.deepEqual(effects, ['disconnect']);
  assert.equal(player.current, null);
  assert.equal(player.destroyed, false);
  assert.equal(player.get('voiceCloseRecoveryInProgress'), false);
});

test('session rotation during worker remote deletion never reconnects an old session', async t => {
  const { node, player } = createPlayer(t);
  node.sessionId = 'old-session';
  const entered = deferred();
  const release = deferred();
  const effects = [];
  player.disconnect = async () => { effects.push('disconnect'); return player; };
  player.connect = async () => { effects.push('connect'); return player; };
  player.restart = async () => { effects.push('restart'); return true; };
  node.rest.destroyPlayer = async () => { effects.push('remote-delete'); entered.resolve(); await release.promise; };
  const handling = node.handleWorkerFailed(workerFailure(player));
  await entered.promise;
  node.sessionId = 'new-session';
  release.resolve();
  await handling;
  assert.deepEqual(effects, ['disconnect', 'remote-delete']);
  assert.equal(player.destroyed, false);
  assert.equal(player.get('voiceCloseRecoveryInProgress'), false);
});

test('failed stale disconnect cannot destroy a replacement user playback intent', async t => {
  const { node, player } = createPlayer(t);
  const entered = deferred(), release = deferred();
  let destroyed = 0;
  let remoteDeletes = 0;
  player.disconnect = async () => { entered.resolve(); await release.promise; throw new Error('late worker failure'); };
  player.destroy = async () => { destroyed++; };
  node.rest.destroyPlayer = async () => { remoteDeletes++; };
  const handling = node.handleWorkerFailed(workerFailure(player));
  await entered.promise;
  playbackGuard(player).invalidate(); // Equivalent to a new user play/stop intent.
  release.resolve();
  await handling;
  assert.equal(destroyed, 0);
  assert.equal(remoteDeletes, 0);
  assert.equal(player.destroyed, false);
  assert.equal(player.get('voiceCloseRecoveryInProgress'), false);
});

test('duplicate and malformed worker guild IDs cannot duplicate recovery', async t => {
  const { node, player } = createPlayer(t);
  let disconnects = 0;
  let restarts = 0;
  player.disconnect = async () => { disconnects++; return player; };
  player.connect = async () => player;
  player.restart = async () => { restarts++; return true; };
  node.rest.destroyPlayer = async () => {};
  await node.handleWorkerFailed(workerFailure(player, [
    player.guildId, player.guildId, 'invalid', 5, null, player.guildId
  ]));
  assert.equal(disconnects, 1);
  assert.equal(restarts, 1);
  assert.equal(player.get('voiceCloseRecoveryInProgress'), false);
});
