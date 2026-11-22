const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

test('a delayed play is settled before stop reaches the backend', async t => {
  const { node, player } = createPlayer(t);
  const sent = deferred();
  const release = deferred();
  const applied = [];
  node.rest.updatePlayer = async (_guild, payload) => {
    if (payload.track?.encoded) { sent.resolve(); await release.promise; }
    applied.push(payload);
    return payload;
  };
  const play = player.play({ track: createTrack('old') });
  await sent.promise;
  const stop = player.stop();
  release.resolve();
  await Promise.all([play, stop]);
  assert.deepEqual(applied.map(p => p.track?.encoded), ['encoded-old', null]);
  assert.equal(player.current, null);
  assert.equal(player.playing, false);
});

test('stop completes before a later explicit play reaches the backend', async t => {
  const { node, player } = createPlayer(t);
  const stopped = deferred();
  const release = deferred();
  const applied = [];
  node.rest.updatePlayer = async (_guild, payload) => {
    if (payload.track?.encoded === null) { stopped.resolve(); await release.promise; }
    applied.push(payload);
    return payload;
  };
  const stop = player.stop();
  await stopped.promise;
  const track = createTrack('new');
  const play = player.play({ track });
  release.resolve();
  await Promise.all([stop, play]);
  assert.deepEqual(applied.map(p => p.track?.encoded), [null, track.encoded]);
  assert.equal(player.current, track);
  assert.equal(player.playing, true);
});

test('pause then resume both apply when pause acknowledgement is delayed', async t => {
  const { node, player } = createPlayer(t);
  player.current = createTrack('current');
  player.playing = true;
  const started = deferred();
  const release = deferred();
  const applied = [];
  node.rest.updatePlayer = async (_guild, payload) => {
    if (payload.paused) { started.resolve(); await release.promise; }
    applied.push(payload);
    return payload;
  };
  const pause = player.pause();
  await started.promise;
  const resume = player.resume();
  release.resolve();
  await Promise.all([pause, resume]);
  assert.deepEqual(applied, [{ paused: true }, { paused: false }]);
  assert.equal(player.paused, false);
});

test('destroy waits for in-flight playback and leaves no active backend player', async t => {
  const { node, player } = createPlayer(t);
  const started = deferred();
  const release = deferred();
  let backendTrack = null;
  node.rest.updatePlayer = async (_guild, payload) => {
    started.resolve();
    await release.promise;
    backendTrack = payload.track?.encoded;
    return payload;
  };
  node.rest.destroyPlayer = async () => { backendTrack = null; };
  const play = player.play({ track: createTrack('obsolete') });
  await started.promise;
  const destroy = player.destroy('test');
  release.resolve();
  await Promise.all([play, destroy]);
  assert.equal(backendTrack, null);
  assert.equal(player.destroyed, true);
  assert.equal(player.playing, false);
});

test('a rejected command does not prevent later seek and stop commands', async t => {
  const { node, player, requests } = createPlayer(t);
  const original = node.rest.updatePlayer;
  node.rest.updatePlayer = async (guild, payload) => {
    if (payload.paused) throw new Error('pause rejected');
    return original(guild, payload);
  };
  await assert.rejects(player.pause(), /pause rejected/);
  await player.seek(1000);
  await player.stop();
  assert.deepEqual(requests.map(r => r.payload), [{ position: 1000 }, { track: { encoded: null } }]);
});

test('a timed-out resume still finishes before a later stop reaches the backend', async t => {
  const { node, player } = createPlayer(t);
  player.paused = true;
  const started = deferred();
  const release = deferred();
  const applied = [];
  node.rest.updatePlayer = async (_guild, payload) => {
    if (payload.paused === false) { started.resolve(); await release.promise; }
    applied.push(payload);
    return payload;
  };
  const resume = player.resume({ timeout: 10 });
  const rejected = assert.rejects(resume, /Resume timed out/);
  await started.promise;
  await rejected;
  const stop = player.stop();
  release.resolve();
  await stop;
  assert.deepEqual(applied, [{ paused: false }, { track: { encoded: null } }]);
  assert.equal(player.playing, false);
});

test('empty REST responses reject stop and preserve the known playing state', async t => {
  const { node, player } = createPlayer(t);
  const current = createTrack('current');
  player.current = current;
  player.playing = true;
  node.rest.updatePlayer = async () => null;
  await assert.rejects(player.stop(), /acknowledge/);
  assert.equal(player.current, current);
  assert.equal(player.playing, true);
});

test('disabling autoplay does not cancel an explicit play requested in the same tick', async t => {
  const { player, requests } = createPlayer(t);
  const track = createTrack('requested');
  const pending = player.play({ track });
  player.setAutoPlay(false);
  assert.equal(await pending, true);
  assert.equal(player.current, track);
  assert.equal(requests[0].payload.track.encoded, track.encoded);
});

test('first play completes the voice handshake without deadlocking the command queue', async t => {
  const { manager, player, requests } = createPlayer(t);
  player.voice.sessionId = null;
  player.voice.endpoint = null;
  player.voice.token = null;
  manager.options.voiceConnection.timeout = 200;
  const requested = deferred();
  manager.send = () => requested.resolve();
  const track = createTrack('first');
  const playing = player.play({ track });
  await requested.promise;
  await player.voice.handleStateUpdate({ channel_id: player.voiceChannelId, session_id: 'new-session' });
  player.voice.handleServerUpdate({ token: 'new-token', endpoint: 'voice.test' });
  assert.equal(await playing, true);
  assert.equal(player.current, track);
  assert.ok(requests[0].payload.voice);
  assert.equal(requests[1].payload.track.encoded, track.encoded);
});


test('play does not serialize arbitrary options or private track data into debug messages', async t => {
  const { manager, player, requests } = createPlayer(t);
  const messages = [];
  manager.on('debug', message => messages.push(message));
  const track = createTrack('redaction-test');
  track.userData = { privateValue: 'private-track-data-sentinel' };
  const options = { track };
  options.circular = options;
  assert.equal(await player.play(options), true);
  assert.equal(requests[0].payload.track.userData.privateValue, 'private-track-data-sentinel');
  assert.ok(!messages.join('\n').includes('private-track-data-sentinel'));
});


for (const withPrevious of [false, true]) {
  test(`rejected playback restores persistent playback state (previous=${withPrevious})`, async t => {
    const { manager, node, player } = createPlayer(t);
    const previous = withPrevious ? createTrack('previous') : null;
    const next = createTrack('rejected');
    player.current = previous;
    player.playing = false;
    player.paused = withPrevious;
    node.rest.updatePlayer = async () => { throw new Error('play rejected'); };
    assert.equal(await player.play({ track: next }), false);
    assert.equal(player.current, previous);
    assert.equal(player.playing, false);
    assert.equal(player.paused, withPrevious);
    assert.deepEqual(player.queue.tracks, [next]);
    const saved = await manager.database.get(`players.${player.guildId}`);
    assert.equal(saved.current?.encoded ?? null, previous?.encoded ?? null);
    assert.equal(saved.playing, false);
    assert.equal(saved.paused, withPrevious);
    assert.deepEqual(saved.queue.map(track => track.encoded), [next.encoded]);
  });
}

test('restored player uses the stored metadata position for its health checkpoint', async t => {
  const {manager,node}=createPlayer(t);
  const {Player,TrackCodec}=require('../dist');
  const record=TrackCodec.serialize(createTrack('restored-position'));
  record.info.position=42000;
  const restored=new Player(manager,node,{guildId:'323456789012345678',voiceChannelId:'223456789012345678',current:record});
  t.after(()=>restored.stopHealthCheck());
  restored.stopHealthCheck();
  assert.equal(restored.current.getInfo().position,42000);
  assert.equal(restored.lastPosition,42000);
});

test('an explicit zero position overrides embedded restored metadata', async t => {
  const {manager,node}=createPlayer(t);
  const {Player,TrackCodec}=require('../dist');
  const record=TrackCodec.serialize(createTrack('restored-zero'));
  record.info.position=42000;
  record.position=0;
  const restored=new Player(manager,node,{guildId:'323456789012345678',voiceChannelId:'223456789012345678',current:record});
  t.after(()=>restored.stopHealthCheck());
  restored.stopHealthCheck();
  assert.equal(restored.current.getInfo().position,0);
  assert.equal(restored.lastPosition,0);
});
