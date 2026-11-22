const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlayer, createTrack } = require('./helpers/player.cjs');

for (const reason of ['gapless', 'crossfading']) {
  test(reason + ' track-end retains active player state until next track starts', async t => {
    const { manager, node, player, requests } = createPlayer(t);
    player.setAutoPlay(false);
    const current = createTrack('current');
    current.position = 42000;
    player.current = current;
    player.playing = true;
    player.paused = false;
    player.set('lastKnownPosition', 41000);
    const queued = createTrack('next');
    player.queue.add(queued);
    const ended = [], queueEnds = [];
    manager.on('trackEnd', (_player, track, reasonCode) => ended.push([track.identifier, reasonCode]));
    manager.on('queueEnd', () => queueEnds.push(true));
    await node.handleTrackEnd(player, { reason, track: current.toJSON() });
    assert.equal(player.playing, true);
    assert.equal(player.paused, false);
    assert.equal(player.current, current);
    assert.equal(player.current.position, 42000);
    assert.equal(player.get('lastKnownPosition'), 41000);
    assert.deepEqual(player.queue.tracks, [queued]);
    assert.deepEqual(ended, [['current', reason]]);
    assert.deepEqual(queueEnds, []);
    assert.equal(requests.filter(x => x.payload.track?.encoded).length, 0);
  });

  test(reason + ' end retains a confirmed pause instead of announcing a stop', async t => {
    const { node, player } = createPlayer(t);
    player.setAutoPlay(false);
    const current = createTrack('paused');
    player.current = current;
    player.playing = true;
    player.paused = true;
    await node.handleTrackEnd(player, { reason, track: current.toJSON() });
    assert.equal(player.playing, true);
    assert.equal(player.paused, true);
  });
}

test('terminal cleanup still sets playing false and never advances queued tracks', async t => {
  const { node, player, requests } = createPlayer(t);
  player.setAutoPlay(false);
  const current = createTrack('ending');
  const next = createTrack('next');
  player.current = current;
  player.playing = true;
  player.queue.add(next);
  player.set('lastKnownPosition', 6000);
  await node.handleTrackEnd(player, { reason: 'cleanup', track: current.toJSON() });
  assert.equal(player.playing, false);
  assert.equal(player.paused, false);
  assert.equal(player.get('lastKnownPosition'), null);
  assert.deepEqual(player.queue.tracks, [next]);
  assert.equal(requests.filter(x => x.payload.track?.encoded).length, 0);
});

test('a late gapless end from the previous track cannot stop an already accepted successor', async t => {
  const { node, player } = createPlayer(t);
  player.setAutoPlay(false);
  const previous = createTrack('previous');
  const next = createTrack('next');
  await player.play({ track: next });
  player.playing = true;
  await node.handleTrackEnd(player, { reason: 'gapless', track: previous.toJSON() });
  assert.equal(player.current, next);
  assert.equal(player.playing, true);
});
