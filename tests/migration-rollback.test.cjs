const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, NodeState, TrackCodec, BackendDetector } = require('../dist');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

async function migration(t) {
  const fixture = createPlayer(t);
  const { manager, node: source, player } = fixture;
  player.setAutoPlay(false);
  player.voice.connect = async () => {};
  const target = new Node(manager, { identifier: 'target', host: '127.0.0.1', port: 2444, password: 'test', secure: false });
  target.connected = true;
  target.state = NodeState.READY;
  target.rest.updatePlayer = async (_guild, payload) => payload;
  target.rest.destroyPlayer = async () => {};
  manager.nodes.nodes.set(target.identifier, target);
  t.after(async () => { await target.destroy(); await manager.database.shutdown(); });
  const current = createTrack('current');
  current.position = 45000;
  current.requester = { id: 'requester' };
  current.userData = { requester: current.requester, custom: 'retained' };
  player.current = current;
  player.playing = true;
  player.paused = true;
  player.volume = 62;
  const lastState = { position: 44000, connected: true };
  player.set('lastState', lastState);
  const queued = createTrack('queued');
  const previous = createTrack('previous');
  player.queue.add(queued);
  player.previous = [previous];
  await manager.database.set(`players.${player.guildId}.node`, source.identifier);
  await manager.database.set(`players.${player.guildId}.current`, TrackCodec.serialize(current));
  return { ...fixture, source, target, current, queued, previous, lastState };
}

for (const rejected of ['voice', 'track']) {
  test(`a rejected target ${rejected} update rolls back local ownership without destroying the origin`, async t => {
    const { manager, source, target, player, current, queued, previous, lastState } = await migration(t);
    let originCleanup = 0;
    let targetCleanup = 0;
    source.rest.destroyPlayer = async () => { originCleanup++; };
    target.rest.destroyPlayer = async () => { targetCleanup++; };
    target.rest.updatePlayer = async (_guild, payload) => {
      if (rejected === 'voice' ? payload.voice : payload.track?.encoded) throw new Error('target rejected restore');
      return payload;
    };
    assert.equal(await player.transferNode(target), false);
    assert.equal(originCleanup, 0);
    assert.equal(targetCleanup, 1);
    assert.equal(player.node, source);
    assert.equal(player.current, current);
    assert.equal(current.position, 45000);
    assert.equal(player.playing, true);
    assert.equal(player.paused, true);
    assert.equal(player.volume, 62);
    assert.deepEqual(player.queue.tracks, [queued]);
    assert.deepEqual(player.previous, [previous]);
    assert.equal(player.get('lastState'), lastState);
    assert.deepEqual(current.userData, { requester: { id: 'requester' }, custom: 'retained' });
    assert.equal(await manager.database.get(`players.${player.guildId}.node`), source.identifier);
  });
}

test('successful migration acknowledges the destination and commits its owner before origin cleanup', async t => {
  const { manager, source, target, player } = await migration(t);
  const order = [];
  target.rest.updatePlayer = async (_guild, payload) => {
    order.push(payload.track?.encoded ? 'track-ack' : 'voice-ack');
    return payload;
  };
  let ownerAtCleanup;
  source.rest.destroyPlayer = async () => {
    ownerAtCleanup = await manager.database.get(`players.${player.guildId}.node`);
    order.push('origin-cleanup');
  };
  assert.equal(await player.transferNode(target), true);
  assert.ok(order.indexOf('origin-cleanup') > order.indexOf('track-ack'), order.join(','));
  assert.equal(ownerAtCleanup, target.identifier);
  assert.equal(player.node, target);
});

test('a public restart override that rejects transfer retains the source snapshot and remote player', async t => {
  const { source, target, player, current } = await migration(t);
  let calls = 0;
  let sourceCleanup = 0;
  player.restart = async () => { calls++; return false; };
  source.rest.destroyPlayer = async () => { sourceCleanup++; };
  assert.equal(await player.transferNode(target), false);
  assert.equal(calls, 1);
  assert.equal(sourceCleanup, 0);
  assert.equal(player.node, source);
  assert.equal(player.current, current);
});

test('failed resolution leaves the original remote player and ownership untouched', async t => {
  const { manager, source, target, player, current } = await migration(t);
  current.pluginInfo.needsStream = true;
  target.backend = BackendDetector.detect({ isNodelink: true, version: { semver: '3.10.0' } });
  target.rest.loadTracks = async () => { throw new Error('resolution unavailable'); };
  let cleanups = 0;
  source.rest.destroyPlayer = async () => { cleanups++; };
  assert.equal(await player.transferNode(target), false);
  assert.equal(cleanups, 0);
  assert.equal(player.node, source);
  assert.equal(player.current, current);
  assert.equal(await manager.database.get(`players.${player.guildId}.node`), source.identifier);
});

test('a successful destination receives standard filters and active preset settings', async t => {
  const { target, player } = await migration(t);
  player.filters.enable('nightcore');
  player.filters.equalizer = [{ band: 0, gain: 0.2 }];
  player.filters.volume = 0.8;
  const initial = structuredClone(player.filters.toJSON());
  const payloads = [];
  target.rest.updatePlayer = async (_guild, payload) => { payloads.push(payload); return payload; };
  assert.equal(await player.transferNode(target), true);
  const filters = payloads.find(payload => payload.filters)?.filters;
  assert.ok(filters, 'destination needs an acknowledged filters payload');
  assert.deepEqual(filters.timescale, { speed: 1.2, pitch: 1.2, rate: 1 });
  assert.deepEqual(filters.equalizer, [{ band: 0, gain: 0.2 }]);
  assert.equal(filters.volume, 0.8);
  assert.equal(filters.activeFilters, undefined);
  assert.deepEqual(player.filters.toJSON(), initial);
});

test('a failed filters acknowledgement rolls back without losing active local presets', async t => {
  const { source, target, player, current } = await migration(t);
  player.filters.enable('nightcore');
  player.filters.equalizer = [{ band: 1, gain: 0.1 }];
  const initial = structuredClone(player.filters.toJSON());
  let sourceCleanup = 0;
  source.rest.destroyPlayer = async () => { sourceCleanup++; };
  target.rest.updatePlayer = async (_guild, payload) => {
    if (payload.filters) throw new Error('filters rejected');
    return payload;
  };
  assert.equal(await player.transferNode(target), false);
  assert.equal(sourceCleanup, 0);
  assert.equal(player.node, source);
  assert.equal(player.current, current);
  assert.deepEqual(player.filters.toJSON(), initial);
});

test('ownership persistence failure rolls back the resolved track and leaves the origin intact', async t => {
  const { manager, source, target, player, current, queued, previous } = await migration(t);
  source.backend = BackendDetector.detect({ version: { semver: '4.2.2' } });
  target.backend = BackendDetector.detect({ isNodelink: true, version: { semver: '3.10.0' } });
  target.rest.loadTracks = async () => ({ loadType: 'track', data: createTrack('destination-encoding').toJSON() });
  const originalQueued = structuredClone(TrackCodec.serialize(queued));
  const originalPrevious = structuredClone(TrackCodec.serialize(previous));
  const set = manager.database.set.bind(manager.database);
  manager.database.set = async (key, value) => {
    if (key === `players.${player.guildId}.node` && value === target.identifier) throw new Error('owner storage rejected');
    return set(key, value);
  };
  let sourceCleanup = 0;
  let targetCleanup = 0;
  source.rest.destroyPlayer = async () => { sourceCleanup++; };
  target.rest.destroyPlayer = async () => { targetCleanup++; };
  assert.equal(await player.transferNode(target), false);
  assert.equal(sourceCleanup, 0);
  assert.equal(targetCleanup, 1);
  assert.equal(player.node, source);
  assert.equal(player.current, current);
  assert.deepEqual(await manager.database.get(`players.${player.guildId}.current`), TrackCodec.serialize(current));
  assert.deepEqual(TrackCodec.serialize(queued), originalQueued);
  assert.deepEqual(TrackCodec.serialize(previous), originalPrevious);
  assert.equal(await manager.database.get(`players.${player.guildId}.node`), source.identifier);
});

for (const command of ['stop', 'play', 'destroy']) {
  test(`${command} issued during target restore executes after rollback on the original node`, async t => {
    const { manager, source, target, player, queued } = await migration(t);
    const started = deferred();
    const release = deferred();
    let targetCommands = 0;
    target.rest.updatePlayer = async (_guild, payload) => {
      if (payload.voice) { started.resolve(); await release.promise; return payload; }
      targetCommands++;
      return payload;
    };
    const sourceCommands = [];
    source.rest.updatePlayer = async (_guild, payload) => { sourceCommands.push(payload); return payload; };
    const moving = player.transferNode(target);
    await started.promise;
    const next = createTrack('new-command');
    const operation = command === 'stop' ? player.stop() : command === 'play' ? player.play({ track: next }) : player.destroy('test cancellation');
    release.resolve();
    assert.equal(await moving, false);
    await operation;
    assert.equal(targetCommands, 0);
    if (command === 'play') {
      assert.equal(player.node, source);
      assert.equal(player.current, next);
      assert.ok(sourceCommands.some(payload => payload.track?.encoded === next.encoded));
      assert.deepEqual(player.queue.tracks, [queued]);
    } else if (command === 'stop') {
      assert.equal(player.node, source);
      assert.equal(player.current, null);
      assert.equal(player.playing, false);
      assert.ok(sourceCommands.some(payload => payload.track?.encoded === null));
      assert.deepEqual(player.queue.tracks, [queued]);
    } else {
      assert.equal(player.destroyed, true);
      assert.equal(player.current, null);
      assert.equal(manager.players.has(player.guildId), false);
      assert.equal(await manager.database.has(`players.${player.guildId}`), false);
    }
  });
}

test('a newer migration derives its source after the rejected earlier transfer rolls back', async t => {
  const { manager, source, target: first, player } = await migration(t);
  const second = new Node(manager, { identifier: 'second', host: '127.0.0.1', port: 2445, password: 'test', secure: false });
  second.connected = true;
  second.state = NodeState.READY;
  second.rest.destroyPlayer = async () => {};
  second.rest.updatePlayer = async (_guild, payload) => payload;
  manager.nodes.nodes.set(second.identifier, second);
  t.after(() => second.destroy());
  const started = deferred();
  const release = deferred();
  first.rest.updatePlayer = async (_guild, payload) => {
    if (payload.voice) { started.resolve(); await release.promise; }
    return payload;
  };
  const reports = [];
  manager.on('playerNodeFailover', (_player, report) => reports.push(report));
  const earlier = player.transferNode(first);
  await started.promise;
  const newer = player.transferNode(second);
  release.resolve();
  assert.equal(await earlier, false);
  assert.equal(await newer, true);
  assert.equal(player.node, second);
  const committed = reports.find(report => report.target === second.identifier && report.status === 'recovered');
  assert.ok(committed);
  assert.equal(committed.source, source.identifier);
  assert.equal(await manager.database.get(`players.${player.guildId}.node`), second.identifier);
});

test('an accepted target start followed by HTTP failure still restores the original attempt identity', async t => {
  const { source, target, player, current, queued, requests } = await migration(t);
  assert.equal(await player.play({ track: current, position: 45000 }), true);
  const sourceWire = { ...current.toJSON(), userData: structuredClone(requests.find(request => request.payload.track?.encoded).payload.track.userData) };
  await source.handleTrackStart(player, { track: sourceWire });
  current.position = 45000;
  target.rest.updatePlayer = async (_guild, payload) => {
    if (payload.track?.encoded) {
      await target.handleTrackStart(player, { track: { ...current.toJSON(), userData: structuredClone(payload.track.userData) } });
      throw new Error('ack failed after target start');
    }
    return payload;
  };
  assert.equal(await player.transferNode(target), false);
  assert.equal(player.node, source);
  assert.equal(player.current, current);
  assert.equal(current.position, 45000);
  await Promise.all(Array.from({ length: 2 }, () => source.handleTrackEnd(player, { reason: 'finished', track: structuredClone(sourceWire) })));
  assert.equal(player.current, queued);
  assert.equal(player.queue.size, 0);
  assert.equal(requests.filter(request => request.payload.track?.encoded).length, 2);
});

test('source cleanup failure after commit reports the origin fault without undoing destination ownership', async t => {
  const { manager, source, target, player } = await migration(t);
  const failure = new Error('origin cleanup rejected');
  source.rest.destroyPlayer = async () => { throw failure; };
  const faults = [];
  const reports = [];
  manager.on('nodeError', (node, error) => faults.push({ node, error }));
  manager.on('playerNodeFailover', (_player, report) => reports.push(report));
  assert.equal(await player.transferNode(target), true);
  assert.equal(player.node, target);
  assert.equal(await manager.database.get(`players.${player.guildId}.node`), target.identifier);
  assert.ok(faults.some(fault => fault.node === source && fault.error === failure));
  assert.ok(reports.some(report => report.status === 'recovered' && report.reason));
  assert.equal(reports.some(report => report.status === 'failed'), false);
});

for (const cleaned of ['source', 'target']) {
  test(`migration ${cleaned} cleanup receives a finite ten-second HTTP budget`, async t => {
    const { source, target, player } = await migration(t);
    let cleanupOptions;
    if (cleaned === 'source') source.rest.destroyPlayer = async (_guild, options) => { cleanupOptions = options; };
    else {
      target.rest.updatePlayer = async () => { throw new Error('restore rejected'); };
      target.rest.destroyPlayer = async (_guild, options) => { cleanupOptions = options; };
    }
    assert.equal(await player.transferNode(target), cleaned === 'source');
    assert.equal(cleanupOptions?.timeoutMs, 10000);
  });
}

test('real voice credential completion can bypass the queued migration without deadlocking playback restore', { timeout: 1500 }, async t => {
  const { manager, target, player } = await migration(t);
  const voice = player.voice;
  voice.connect = Object.getPrototypeOf(voice).connect.bind(voice);
  manager.options.voiceConnection = { timeout: 1000 };
  t.after(() => voice.destroy());
  const payloads = [];
  target.rest.updatePlayer = async (_guild, payload) => { payloads.push(payload); return payload; };
  manager.send = (_guild, packet) => {
    if (packet.op !== 4 || !packet.d.channel_id) return;
    queueMicrotask(() => {
      void voice.handleStateUpdate({ guild_id: player.guildId, channel_id: player.voiceChannelId, session_id: 'new-voice-session' })
        .then(() => voice.handleServerUpdate({ guild_id: player.guildId, endpoint: 'voice.test.invalid', token: 'new-voice-token' }));
    });
  };
  assert.equal(await player.transferNode(target), true);
  assert.equal(player.node, target);
  assert.equal(payloads.filter(payload => payload.track?.encoded).length, 1);
  assert.ok(payloads.some(payload => payload.voice?.token === 'new-voice-token'));
});

test('an empty player sends filters without starting its queued track', async t => {
  const { target, player, queued } = await migration(t);
  player.current = null;
  player.playing = false;
  player.filters.enable('nightcore');
  const payloads = [];
  target.rest.updatePlayer = async (_guild, payload) => { payloads.push(payload); return payload; };
  assert.equal(await player.transferNode(target), true);
  assert.equal(player.current, null);
  assert.deepEqual(player.queue.tracks, [queued]);
  assert.equal(payloads.some(payload => payload.track?.encoded), false);
  assert.ok(payloads.some(payload => payload.filters?.timescale?.pitch === 1.2));
});

test('rollback still restores ownership when a separate snapshot field cannot be persisted', async t => {
  const { manager, source, target, player, current } = await migration(t);
  const set = manager.database.set.bind(manager.database);
  const ownerWritten = deferred();
  const release = deferred();
  let rollingBack = false;
  manager.database.set = async (key, value) => {
    if (key.endsWith('.node') && value === target.identifier) {
      await set(key, value);
      ownerWritten.resolve();
      await release.promise;
      rollingBack = true;
      return;
    }
    if (rollingBack && key.endsWith('.current') && value?.encoded === current.encoded) throw new Error('snapshot unavailable');
    return set(key, value);
  };
  const moving = player.transferNode(target);
  await ownerWritten.promise;
  const stopping = player.stop();
  release.resolve();
  assert.equal(await moving, false);
  await stopping;
  assert.equal(player.node, source);
  assert.equal(await manager.database.get(`players.${player.guildId}.node`), source.identifier);
});

test('commands queued during committed source cleanup operate on the destination', async t => {
  const { manager, source, target, player } = await migration(t);
  const cleaning = deferred();
  const release = deferred();
  source.rest.destroyPlayer = async () => { cleaning.resolve(); await release.promise; };
  const payloads = [];
  target.rest.updatePlayer = async (_guild, payload) => { payloads.push(payload); return payload; };
  const moving = player.transferNode(target);
  await cleaning.promise;
  const stopping = player.stop();
  release.resolve();
  assert.equal(await moving, true);
  await stopping;
  assert.equal(player.node, target);
  assert.equal(player.current, null);
  assert.equal(await manager.database.get(`players.${player.guildId}.node`), target.identifier);
  assert.ok(payloads.some(payload => payload.track?.encoded === null));
});
