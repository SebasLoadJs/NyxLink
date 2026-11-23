const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyCommandSequence, waitForSnapshot } = require('../scripts/live-voice-commands.cjs');

function fixture() {
  const calls = [];
  const state = { paused: false, volume: 100, state: { position: 0 } };
  const tracks = [{ encoded: 'fixture-A' }, { encoded: 'fixture-B' }];
  const player = {
    guildId: '123456789012345678',
    queue: { add(entries) { calls.push(['queue', entries]); } },
    async play() { calls.push('play'); return true; },
    async pause() { calls.push('pause'); state.paused = true; },
    async resume() { calls.push('resume'); state.paused = false; },
    setVolume(n) { calls.push('volume'); state.volume = n; return this; },
    async seek(n) { calls.push('seek'); state.state.position = n; },
    async skip() { calls.push('skip'); return true; },
  };
  const node = { rest: { async getPlayer(guildId) {
    assert.equal(guildId, player.guildId);
    return { ...state, state: { ...state.state } };
  } } };
  return { calls, state, tracks, player, node };
}

test('live command sequence verifies backend acknowledgement without claiming audible output', async () => {
  const { calls, tracks, player, node } = fixture();
  const checks = await verifyCommandSequence(player, node, tracks);
  assert.deepEqual(checks, [
    'playAcknowledged', 'pauseConfirmed', 'resumeConfirmed',
    'volumeConfirmed', 'seekConfirmed', 'skipAcknowledged',
  ]);
  assert.deepEqual(calls.map(v => Array.isArray(v) ? v[0] : v), [
    'queue', 'play', 'pause', 'resume', 'volume', 'seek', 'skip',
  ]);
});

test('command smoke is rejected when its fixture or playback input is incomplete', async () => {
  const { player, node, tracks } = fixture();
  await assert.rejects(verifyCommandSequence(null, node, tracks), TypeError);
  await assert.rejects(verifyCommandSequence(player, node, [tracks[0]]), TypeError);
  await assert.rejects(verifyCommandSequence(player, {}, tracks), TypeError);
});

test('command smoke stops immediately if initial playback is not accepted', async () => {
  const { calls, player, node, tracks } = fixture();
  player.play = async () => false;
  await assert.rejects(verifyCommandSequence(player, node, tracks), /rejected initial play/);
  assert.equal(calls.filter(x => x === 'pause').length, 0);
});

test('command smoke treats a rejected skip as a failed acceptance', async () => {
  const { player, node, tracks } = fixture();
  player.skip = async () => false;
  await assert.rejects(verifyCommandSequence(player, node, tracks), /rejected skip/);
});

test('backend polling detects missing acknowledgements within a bounded interval', async () => {
  const { node, player } = fixture();
  await assert.rejects(waitForSnapshot(node.rest, player.guildId, () => false, 'pause', 25), /did not confirm pause/);
});

test('snapshot polling has a hard deadline even if the REST request never settles', async () => {
  const rest = { getPlayer: async () => new Promise(() => {}) };
  const started = Date.now();
  await assert.rejects(waitForSnapshot(rest, '123456789012345678', () => true, 'hung backend', 45),
    /did not confirm hung backend/);
  assert.ok(Date.now() - started < 500, 'polling exceeded its bounded deadline');
});

test('snapshot polling rejects invalid timeout policies', async () => {
  const { node, player } = fixture();
  for (const value of [0, -1, 1.2, Number.NaN, 60001]) {
    await assert.rejects(waitForSnapshot(node.rest, player.guildId, () => true, 'invalid', value), TypeError);
  }
});

test('snapshot polling survives transient null responses then confirms a valid backend snapshot', async () => {
  let count = 0;
  const rest = { getPlayer: async () => ++count < 3 ? null : { paused: true } };
  await waitForSnapshot(rest, '123456789012345678', row => row.paused === true, 'pause', 900);
  assert.equal(count, 3);
});
