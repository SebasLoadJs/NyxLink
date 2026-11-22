const test = require('node:test');
const assert = require('node:assert/strict');
const { Node } = require('../dist');
const { NodeState } = require('../dist/src/typings/types');
const { playbackGuard } = require('../dist/src/players/PlaybackGuard');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

const frame = code => ({ op:'event', type:'WebSocketClosedEvent', guildId:'123456789012345678',
  code, reason:'backend-sensitive-value', byRemote:true });

function targetNode(manager) {
  const target = new Node(manager, { identifier: 'after-close', host:'127.0.0.1',
    port: 2444, password:'test', secure:false });
  target.connected = true;
  target.state = NodeState.READY;
  manager.nodes.nodes.set(target.identifier, target);
  return target;
}

for (const code of [4022, 5001]) {
  test('voice-close ' + code + ' cannot disconnect a migrated player', async t => {
    const { node, player, manager } = createPlayer(t);
    if (code === 5001) node.isNodeLink = true;
    const destination = targetNode(manager);
    t.after(() => destination.destroy());
    player.node = destination;
    let calls = 0;
    player.disconnect = async () => { calls++; return player; };
    node.rest.destroyPlayer = async () => { calls++; };
    await node.handleWebSocketClosed(player, frame(code));
    assert.equal(calls, 0);
    assert.equal(player.node, destination);
    assert.equal(player.destroyed, false);
  });

  test('voice-close ' + code + ' stops recovery after a newer playback command', async t => {
    const { node, player } = createPlayer(t);
    if (code === 5001) node.isNodeLink = true;
    const started = deferred(), release = deferred();
    let deleted = 0, connected = 0, restarted = 0;
    player.current = createTrack('original');
    player.disconnect = async () => { started.resolve(); await release.promise; return player; };
    node.rest.destroyPlayer = async () => { deleted++; };
    player.connect = async () => { connected++; return player; };
    player.restart = async () => { restarted++; return true; };
    const recovery = node.handleWebSocketClosed(player, frame(code));
    await started.promise;
    await player.stop();
    release.resolve();
    await recovery;
    assert.equal(deleted, 0);
    assert.equal(connected, 0);
    assert.equal(restarted, 0);
    assert.equal(player.destroyed, false);
    assert.equal(player.get('voiceCloseRecoveryInProgress'), false);
  });

  test('voice-close ' + code + ' ignores a new backend session after remote cleanup', async t => {
    const { node, player } = createPlayer(t);
    if (code === 5001) node.isNodeLink = true;
    node.sessionId = 'before-rotation';
    const started = deferred(), release = deferred();
    let connected = 0, restarted = 0;
    player.disconnect = async () => player;
    node.rest.destroyPlayer = async () => { started.resolve(); await release.promise; };
    player.connect = async () => { connected++; return player; };
    player.restart = async () => { restarted++; return true; };
    const recovery = node.handleWebSocketClosed(player, frame(code));
    await started.promise;
    node.sessionId = 'after-rotation';
    release.resolve();
    await recovery;
    assert.equal(connected, 0);
    assert.equal(restarted, 0);
    assert.equal(player.destroyed, false);
  });

  test('voice-close ' + code + ' does not destroy newer intent on late disconnect failure', async t => {
    const { node, player } = createPlayer(t);
    if (code === 5001) node.isNodeLink = true;
    const started = deferred(), release = deferred();
    let destroyed = 0;
    player.disconnect = async () => { started.resolve(); await release.promise; throw new Error('old failure'); };
    player.destroy = async () => { destroyed++; };
    const recovery = node.handleWebSocketClosed(player, frame(code));
    await started.promise;
    playbackGuard(player).invalidate();
    release.resolve();
    await recovery;
    assert.equal(destroyed, 0);
    assert.equal(player.get('voiceCloseRecoveryInProgress'), false);
  });
}

test('voice close 4022 can complete unchanged recovery and resets retry count', async t => {
  const { node, player } = createPlayer(t);
  const stages = [];
  t.mock.timers.enable({ apis: ['setTimeout'] });
  player.set('wsReconnectAttempts', 2);
  player.disconnect = async () => { stages.push('disconnect'); return player; };
  node.rest.destroyPlayer = async () => { stages.push('delete'); };
  player.connect = async () => { stages.push('connect'); return player; };
  player.restart = async options => {
    assert.deepEqual(options, { destroyOnFailure: false });
    stages.push('restart');
    return true;
  };
  const pending = node.handleWebSocketClosed(player, frame(4022));
  for (let i = 0; i < 4; i++) await Promise.resolve();
  assert.deepEqual(stages, ['disconnect','delete']);
  t.mock.timers.tick(750);
  await pending;
  assert.deepEqual(stages, ['disconnect','delete','connect','restart']);
  assert.equal(player.get('wsReconnectAttempts'), 0);
  assert.equal(player.get('voiceCloseRecoveryInProgress'), false);
});

test('ordinary voice close 5001 on Lavalink does not execute NodeLink-specific recovery', async t => {
  const { node, player } = createPlayer(t);
  player.set('userInitiatedConnect', true);
  let disconnected = 0;
  player.disconnect = async () => { disconnected++; return player; };
  await node.handleWebSocketClosed(player, frame(5001));
  assert.equal(disconnected, 0);
});
