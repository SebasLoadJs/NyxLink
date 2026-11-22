const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

const event = { code: 4010, reason: 'test voice disconnect', byRemote: true };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(t) {
  const ctx = createPlayer(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  ctx.manager.options.voiceConnection.reconnectDelay = 50;
  ctx.player.set('userInitiatedConnect', true);
  ctx.player.current = createTrack('current');
  ctx.player.playing = true;
  return ctx;
}

test('duplicate voice-close events schedule one recovery and count one attempt', async t => {
  const { node, player } = fixture(t);
  let restarts = 0;
  player.restart = async () => { restarts++; return true; };
  await node.handleWebSocketClosed(player, event);
  await node.handleWebSocketClosed(player, event);
  assert.equal(node.voiceReconnectTimers.size, 1);
  assert.equal(player.get('wsReconnectAttempts'), 1);
  t.mock.timers.tick(50);
  await flush();
  assert.equal(restarts, 1);
  assert.equal(node.voiceReconnectTimers.size, 0);
  assert.equal(player.get('wsReconnectAttempts'), 0);
});

test('destroying a node clears delayed voice recovery work', async t => {
  const { node, player } = fixture(t);
  let restarts = 0;
  player.restart = async () => { restarts++; return true; };
  await node.handleWebSocketClosed(player, event);
  await node.destroy();
  assert.equal(node.voiceReconnectTimers.size, 0);
  t.mock.timers.tick(50);
  await flush();
  assert.equal(restarts, 0);
});

test('disconnect cancels the pending reconnection before its timer fires', async t => {
  const { node, player } = fixture(t);
  let restarts = 0;
  player.restart = async () => { restarts++; return true; };
  player.voice.disconnect = async () => {};
  await node.handleWebSocketClosed(player, event);
  await player.disconnect();
  assert.equal(node.voiceReconnectTimers.size, 0);
  t.mock.timers.tick(50);
  await flush();
  assert.equal(restarts, 0);
});

test('a false restart acknowledgement does not reset recovery attempts or log success', async t => {
  const { manager, node, player } = fixture(t);
  const logs = [];
  manager.on('debug', message => logs.push(message));
  player.restart = async () => false;
  await node.handleWebSocketClosed(player, event);
  t.mock.timers.tick(50);
  await flush();
  assert.equal(player.get('wsReconnectAttempts'), 1);
  assert.equal(player.get('voiceCloseRecoveryInProgress'), false);
  assert.ok(!logs.join('\n').includes('Voice recovery finished'));
});

test('a stale recovery failure cannot destroy playback after a newer stop', async t => {
  const { manager, node, player } = fixture(t);
  manager.options.voiceConnection.maxReconnectAttempts = 1;
  const result = deferred();
  player.restart = () => result.promise;
  await node.handleWebSocketClosed(player, event);
  t.mock.timers.tick(50);
  await player.stop();
  result.resolve(false);
  await flush();
  assert.equal(player.destroyed, false);
});
