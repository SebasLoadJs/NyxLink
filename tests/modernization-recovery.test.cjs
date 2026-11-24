const test = require('node:test');
const assert = require('node:assert/strict');
const { playbackGuard } = require('../dist/src/players/PlaybackGuard');
const { createPlayer, deferred } = require('./helpers/player.cjs');

async function beginWorkerRecovery(t, setup) {
  const fixture = createPlayer(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  fixture.player.disconnect = async () => fixture.player;
  fixture.node.rest.destroyPlayer = async () => {};
  fixture.player.connect = async () => fixture.player;
  setup(fixture);
  const operation = fixture.node.handleWorkerFailed({ op: 'event', type: 'WorkerFailedEvent', affectedGuilds: [fixture.player.guildId] });
  for (let i = 0; i < 6; i++) await Promise.resolve();
  t.mock.timers.tick(750);
  return { ...fixture, operation };
}

test('worker restart disables nested destruction and ignores a late failure after a new intent', async t => {
  const entered = deferred(), release = deferred();
  const { player, operation } = await beginWorkerRecovery(t, ({ player }) => {
    player.restart = async options => { assert.deepEqual(options, { destroyOnFailure: false }); entered.resolve(); await release.promise; throw new Error('late backend rejection'); };
  });
  await entered.promise;
  playbackGuard(player).invalidate();
  release.resolve();
  await operation;
  assert.equal(player.destroyed, false);
  assert.equal(player.get('voiceCloseRecoveryInProgress'), false);
});

test('a debug observer failure cannot destroy an otherwise current unacknowledged recovery', async t => {
  const { player, operation } = await beginWorkerRecovery(t, ({ player, manager }) => {
    player.restart = async () => false;
    manager.on('debug', message => { if (message.includes('was not acknowledged')) throw new Error('observer'); });
  });
  await operation;
  assert.equal(player.destroyed, false);
  assert.equal(player.get('voiceCloseRecoveryInProgress'), false);
});

test('unsuccessful voice-close recovery does not reset its retry budget', async t => {
  const { node, player } = createPlayer(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  player.set('wsReconnectAttempts', 3);
  player.disconnect = async () => player; node.rest.destroyPlayer = async () => {};
  player.connect = async () => player; player.restart = async () => false;
  const pending = node.recoverSpecialVoiceClose(player, 4022);
  for (let i = 0; i < 6; i++) await Promise.resolve();
  t.mock.timers.tick(750);
  await pending;
  assert.equal(player.get('wsReconnectAttempts'), 3);
  assert.equal(player.destroyed, false);
});
