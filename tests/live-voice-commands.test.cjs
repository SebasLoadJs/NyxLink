const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyCommandSequence, verifyReconnectSequence, waitForSnapshot, withDeadline } = require('../scripts/live-voice-commands.cjs');

function fixture() {
  const calls = [];
  const state = { paused: false, volume: 100, track: null, state: { position: 0 } };
  const tracks = [{ encoded: 'fixture-A' }, { encoded: 'fixture-B' }];
  const player = {
    guildId: '123456789012345678',
    queue: { add(entries) { calls.push(['queue', entries]); } },
    async play() { calls.push('play'); state.track = { encoded: tracks[0].encoded }; return true; },
    async pause() { calls.push('pause'); state.paused = true; },
    async resume() { calls.push('resume'); state.paused = false; },
    async setVolumeAsync(n) { calls.push('volume'); state.volume = n; return this; },
    async seek(n) { calls.push('seek'); state.state.position = n; },
    async skip() { calls.push('skip'); state.track = { encoded: tracks[1].encoded }; return true; },
    async stop() { calls.push('stop'); state.track = null; return this; },
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
    'playAcknowledged', 'firstTrackConfirmed', 'pauseConfirmed', 'resumeConfirmed',
    'volumeConfirmed', 'seekConfirmed', 'skipAcknowledged', 'secondTrackConfirmed', 'stopConfirmed',
  ]);
  assert.deepEqual(calls.map(v => Array.isArray(v) ? v[0] : v), [
    'queue', 'play', 'pause', 'resume', 'volume', 'seek', 'skip', 'stop',
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

test('command acceptance rejects a failed stop', async () => {
  const { player, node, tracks } = fixture();
  player.stop = async () => { throw new Error('backend rejected stop'); };
  await assert.rejects(verifyCommandSequence(player, node, tracks), /backend rejected stop/);
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

function reconnectFixture() {
  const calls = [];
  const encoded = 'fixture-recovery-A';
  const state = { track: null, state: { connected: true, position: 0 } };
  const player = {
    guildId: '123456789012345678',
    connected: true,
    voice: { sessionId: 'fixture-session', token: 'fixture-token', endpoint: 'voice.example.invalid' },
    queue: { add(tracks) { calls.push(['queue', tracks.length]); } },
    async play() { calls.push('play'); state.track = { encoded }; return true; },
    async disconnect() { calls.push('disconnect'); this.connected = false; state.state.connected = false; },
    async connect() { calls.push('connect'); this.connected = true; },
    async restart(options) {
      calls.push(['restart', options]);
      state.state.connected = true;
      return true;
    },
  };
  const node = { rest: { async getPlayer() { return { ...state, state: { ...state.state } }; } } };
  return { calls, player, node, track: { encoded }, state };
}

test('real reconnect smoke confirms old voice disconnect and new backend track state', async () => {
  const { calls, player, node, track } = reconnectFixture();
  assert.deepEqual(await verifyReconnectSequence(player, node, track), [
    'initialTrackConfirmed', 'disconnectConfirmed', 'voiceReconnected',
    'restartAcknowledged', 'backendVoiceAndTrackConfirmed',
  ]);
  assert.deepEqual(calls.map(x => Array.isArray(x) ? x[0] : x),
    ['queue', 'play', 'disconnect', 'connect', 'restart']);
  assert.deepEqual(calls[4][1], { destroyOnFailure: false, startQueued: false });
});

test('reconnect acceptance rejects missing tracks and rejected restart', async () => {
  const { player, node, track } = reconnectFixture();
  await assert.rejects(verifyReconnectSequence(player, node, null), TypeError);
  player.restart = async () => false;
  await assert.rejects(verifyReconnectSequence(player, node, track),
    /Playback restart rejected/);
});

test('reconnect acceptance stops after unsuccessful voice rejoin', async () => {
  const { calls, player, node, track } = reconnectFixture();
  player.connect = async function () { calls.push('connect'); this.connected = false; };
  await assert.rejects(verifyReconnectSequence(player, node, track), /Voice credentials were not confirmed/);
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === 'restart'), false);
});

test('reconnect acceptance rejects backend that reports a disconnected voice', async () => {
  const { player, node, track } = reconnectFixture();
  player.restart = async () => true;
  // Not audible evidence: backend state must also report connected.
  node.rest.getPlayer = async () => ({ track: { encoded: track.encoded }, state: { connected: false } });
  await assert.rejects(verifyReconnectSequence(player, node, track),
    /did not confirm reconnected active track/);
});

test('live command timeout returns a bounded failure when an operation never resolves', async () => {
  const started = Date.now();
  await assert.rejects(withDeadline(() => new Promise(() => {}), 'voice reconnect', 30),
    /Live command timed out: voice reconnect/);
  assert.ok(Date.now() - started < 500, 'stalled player command exceeded its deadline');
});

test('successful and rejected player commands settle without waiting for their deadline', async () => {
  assert.equal(await withDeadline(async () => 'ack', 'initial play', 5000), 'ack');
  await assert.rejects(withDeadline(async () => { throw new Error('backend rejected'); }, 'skip', 5000),
    /backend rejected/);
});

test('live command timeout rejects invalid deadlines and unsafe labels', async () => {
  for (const ms of [0, -1, 1.5, NaN, 60001]) {
    await assert.rejects(withDeadline(async () => true, 'pause', ms), TypeError);
  }
  await assert.rejects(withDeadline(async () => true, 'Bearer secret: http://token', 100), TypeError);
  await assert.rejects(withDeadline(null, 'play', 100), TypeError);
});
