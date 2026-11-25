const test = require('node:test');
const assert = require('node:assert/strict');
const { resumeSessionPlayers } = require('../dist/src/nodes/SessionRecovery');
const { createPlayer, deferred } = require('./helpers/player.cjs');

function row(player, paused = true) {
  return { guildId: player.guildId, paused, volume: 60, track: null, state: { position: 0 } };
}

test('session recovery applies a unique matching row and coalesces concurrent requests', async t => {
  const { manager, node, player } = createPlayer(t);
  const pending = deferred();
  let requests = 0, resumed = 0;
  manager.on('playerResumed', () => resumed++);
  node.rest.getPlayers = () => { requests++; return pending.promise; };
  const first = resumeSessionPlayers(node);
  const second = resumeSessionPlayers(node);
  assert.equal(first, second);
  pending.resolve([row(player)]);
  await first;
  assert.equal(requests, 1);
  assert.equal(resumed, 1);
  assert.equal(player.paused, true);
  assert.equal(player.isResuming, false);
});

test('session recovery ignores contradictory duplicate guild rows', async t => {
  const { manager, node, player } = createPlayer(t);
  let resumed = 0;
  manager.on('playerResumed', () => resumed++);
  node.rest.getPlayers = async () => [row(player, true), row(player, false)];
  await resumeSessionPlayers(node);
  assert.equal(resumed, 0);
  assert.equal(player.paused, false);
});

test('session recovery discards a response from a removed node', async t => {
  const { manager, node, player } = createPlayer(t);
  const entered = deferred(), pending = deferred();
  let resumed = 0;
  manager.on('playerResumed', () => resumed++);
  node.rest.getPlayers = () => { entered.resolve(); return pending.promise; };
  const restoring = resumeSessionPlayers(node);
  await entered.promise;
  manager.nodes.nodes.delete(node.identifier);
  pending.resolve([row(player)]);
  await restoring;
  assert.equal(resumed, 0);
  assert.equal(player.paused, false);
});

test('session recovery does not coalesce a newer backend adapter with an older response', async t => {
  const { manager, node, player } = createPlayer(t);
  const entered = deferred(), pending = deferred();
  let requests = 0, resumed = 0;
  manager.on('playerResumed', () => resumed++);
  node.rest.getPlayers = () => {
    requests++;
    if (requests === 1) { entered.resolve(); return pending.promise; }
    return Promise.resolve([row(player, false)]);
  };
  const old = resumeSessionPlayers(node);
  await entered.promise;
  const originalBackend = node.backend;
  node.backend = { kind: 'nodelink' };
  try {
    const fresh = resumeSessionPlayers(node);
    assert.notEqual(old, fresh);
    await fresh;
    pending.resolve([row(player, true)]);
    await old;
    assert.equal(requests, 2);
    assert.equal(resumed, 1);
    assert.equal(player.paused, false);
  } finally {
    node.backend = originalBackend;
    pending.resolve([]);
  }
});
