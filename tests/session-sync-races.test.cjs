const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

function row(player, track = player.current) {
  return { guildId: player.guildId, paused: false, volume: 100, track: track?.toJSON(), state: { position: 100, connected: true } };
}

test('duplicate rows announce an unchanged player only once', async t => {
  const { node, player, manager } = createPlayer(t);
  node.sessionId = 'active';
  player.current = createTrack('current');
  player.current.position = 100;
  player.playing = true;
  const remote = row(player);
  let resumed = 0;
  manager.on('playerResumed', () => resumed++);
  node.rest.getPlayers = async () => [remote, structuredClone(remote)];
  await node._resumePlayers();
  assert.equal(resumed, 1);
});

test('stop issued before the resume microtask prevents a false resumed announcement', async t => {
  const { node, player, manager } = createPlayer(t);
  node.sessionId = 'active';
  player.current = createTrack('current');
  player.playing = true;
  const remote = row(player);
  const release = deferred();
  node.rest.updatePlayer = async (_guild, payload) => { await release.promise; return payload; };
  node.rest.getPlayers = async () => [remote];
  let resumed = 0;
  manager.on('playerResumed', () => resumed++);
  const resuming = node._resumePlayers();
  const stopping = player.stop();
  t.after(() => release.resolve());
  await resuming;
  release.resolve();
  await stopping;
  assert.equal(resumed, 0);
  assert.equal(player.current, null);
});

test('a different remote encoding cannot apply its position to the local current track', async t => {
  const { node, player, manager } = createPlayer(t);
  node.sessionId = 'active';
  player.current = createTrack('current');
  player.current.position = 10;
  let resumed = 0;
  manager.on('playerResumed', () => resumed++);
  node.rest.getPlayers = async () => [row(player, createTrack('other'))];
  await node._resumePlayers();
  assert.equal(player.current.position, 10);
  assert.equal(resumed, 0);
});

test('a snapshot from an older loop attempt cannot move the new attempt with the same encoding', async t => {
  const { node, player, manager, requests } = createPlayer(t);
  node.sessionId = 'active';
  const track = createTrack('loop');
  await player.play({ track });
  const oldTrack = { ...track.toJSON(), userData: structuredClone(requests.at(-1).payload.track.userData) };
  player.loop = 'track';
  player.playing = true;
  const response = deferred();
  node.rest.getPlayers = () => response.promise;
  let resumed = 0;
  manager.on('playerResumed', () => resumed++);
  const resuming = node._resumePlayers();
  await new Promise(resolve => setImmediate(resolve));
  await node.handleTrackEnd(player, { reason: 'finished', track: oldTrack });
  const nextTrack = { ...track.toJSON(), userData: structuredClone(requests.at(-1).payload.track.userData) };
  await node.handleTrackStart(player, { track: nextTrack });
  response.resolve([{ ...row(player), track: oldTrack, state: { position: 1000, connected: true } }]);
  await resuming;
  assert.equal(player.current.position, 0);
  assert.equal(resumed, 0);
});
