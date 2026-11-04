const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, NodeLinkAdapter, TrackCodec } = require('../dist/index.js');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

const playbackRequests = requests => requests.filter(({ payload }) => typeof payload.track?.encoded === 'string');

test('a positional skip cancelled by a queue listener retains the accepted track end', async t => {
  const context = createPlayer(t);
  const { manager, node, player } = context;
  player.setAutoPlay(false);
  const current = createTrack('current-before-cancelled-skip');
  const wire = await playAndStart(context, current);
  player.queue.add(createTrack('queued-before-listener'));
  manager.on('playerTriggeredSkip', () => player.queue.clear());
  const ends = [];
  manager.on('queueEnd', () => ends.push(true));
  assert.equal(await player.skip(0), false);
  await node.handleTrackEnd(player, { reason: 'finished', track: wire });
  assert.equal(ends.length, 1);
  assert.equal(player.current, null);
});

for (const options of [{}, { encoded: '?' }]) {
  test(`a play rejected before dispatch retains the currently accepted attempt: ${JSON.stringify(options)}`, async t => {
    const context = createPlayer(t);
    const { manager, node, player } = context;
    player.setAutoPlay(false);
    const current = createTrack('accepted-before-invalid-play');
    const wire = await playAndStart(context, current);
    const ends = [];
    manager.on('queueEnd', () => ends.push(true));
    assert.equal(await player.play(options), false);
    assert.equal(player.current, current);
    await node.handleTrackEnd(player, { reason: 'finished', track: wire });
    assert.equal(ends.length, 1);
    assert.equal(player.current, null);
  });
}

test('a preloaded Track preserves its own requester and metadata on handoff', async t => {
  const context = createPlayer(t);
  const { node, player, requests } = context;
  node.backend = new NodeLinkAdapter('3.10.0', new Set(['nextTrack']));
  node.isNodeLink = true;
  const current = createTrack('current-owner');
  current.setRequester({ id: 'first-requester' });
  await playAndStart(context, current);
  const next = createTrack('next-owner');
  next.setRequester({ id: 'next-requester' });
  next.userData.custom = 'preserved';
  await player.setNextTrack(next);
  const sent = requests.find(({ payload }) => payload.nextTrack?.encoded === next.encoded).payload.nextTrack;
  await node.handleTrackStart(player, { track: { ...next.toJSON(), userData: structuredClone(sent.userData) } });
  assert.equal(player.current.requester.id, 'next-requester');
  assert.equal(player.current.userData.custom, 'preserved');
});

function echoedTrack(track, request) {
  return { ...track.toJSON(), userData: structuredClone(request.payload.track.userData ?? {}) };
}

async function playAndStart(context, track) {
  assert.equal(await context.player.play({ track }), true);
  const outgoing = playbackRequests(context.requests).at(-1);
  const data = echoedTrack(track, outgoing);
  await context.node.handleTrackStart(context.player, { track: data });
  return data;
}

function wireMarkerKey(track, request) {
  const key = Object.keys(request.payload.track.userData ?? {}).find(name => !Object.hasOwn(track.userData, name));
  assert.ok(key, 'playback must carry an identity without mutating caller metadata');
  return key;
}

test('100 duplicate finished events replay a looped attempt only once', async t => {
  const context = createPlayer(t);
  const { node, player, requests } = context;
  player.setAutoPlay(false);
  player.setLoop('track');
  const current = createTrack('looped');
  const eventTrack = await playAndStart(context, current);

  await Promise.all(Array.from({ length: 100 }, () =>
    node.handleTrackEnd(player, { reason: 'finished', track: structuredClone(eventTrack) })));

  assert.equal(playbackRequests(requests).length, 2, 'one initial play plus one loop replay');
  assert.equal(player.current, current);
  assert.equal(player.queue.size, 0);
});

test('legitimate loop iterations remain playable after each new TrackStart', async t => {
  const context = createPlayer(t);
  const { node, player, requests } = context;
  player.setAutoPlay(false);
  player.setLoop('track');
  const current = createTrack('looped');
  let eventTrack = await playAndStart(context, current);

  for (let iteration = 0; iteration < 3; iteration++) {
    await node.handleTrackEnd(player, { reason: 'finished', track: eventTrack });
    const outgoing = playbackRequests(requests).at(-1);
    eventTrack = echoedTrack(current, outgoing);
    await node.handleTrackStart(player, { track: eventTrack });
  }

  assert.equal(playbackRequests(requests).length, 4);
  assert.equal(player.current, current);
  assert.equal(player.playing, true);
});

test('an old end and start cannot affect a newer loop attempt with the same encoding', async t => {
  const context = createPlayer(t);
  const { node, player, requests } = context;
  player.setAutoPlay(false);
  player.setLoop('track');
  const current = createTrack('same');
  const oldTrack = await playAndStart(context, current);
  await node.handleTrackEnd(player, { reason: 'finished', track: oldTrack });
  const nextTrack = echoedTrack(current, playbackRequests(requests).at(-1));
  await node.handleTrackStart(player, { track: nextTrack });
  current.position = 45000;
  player.paused = true;
  const before = playbackRequests(requests).length;

  await node.handleTrackEnd(player, { reason: 'finished', track: structuredClone(oldTrack) });
  await node.handleTrackStart(player, { track: structuredClone(oldTrack) });

  assert.equal(playbackRequests(requests).length, before);
  assert.equal(player.playing, true);
  assert.equal(player.paused, true);
  assert.equal(current.position, 45000);
});

test('100 duplicate loadFailed events consume one retry for a single attempt', async t => {
  const context = createPlayer(t);
  const { manager, node, player, requests } = context;
  player.setAutoPlay(false);
  manager.options.trackHandling = { retryFailedTracks: true, maxRetryAttempts: 3 };
  const current = createTrack('failing');
  const eventTrack = await playAndStart(context, current);

  await Promise.all(Array.from({ length: 100 }, () =>
    node.handleTrackEnd(player, { reason: 'loadFailed', track: structuredClone(eventTrack) })));

  assert.equal(current.retries, 1);
  assert.equal(playbackRequests(requests).length, 2);
  assert.equal(player.queue.size, 0);
});

for (const type of ['TrackStartEvent', 'TrackEndEvent', 'playerUpdate']) {
  test(`a former node's late ${type} does not change its migrated player`, async t => {
    const context = createPlayer(t);
    const { manager, node, player, requests } = context;
    player.setAutoPlay(false);
    const current = createTrack('current');
    const eventTrack = await playAndStart(context, current);
    const target = new Node(manager, { identifier: 'target', host: '127.0.0.1', port: 2334, password: 'test-only' });
    t.after(() => target.destroy());
    player.node = target;
    player.playing = true;
    player.paused = true;
    current.position = 45000;
    const queued = createTrack('queued');
    player.queue.add(queued);
    const before = requests.length;
    const received = [];
    manager.on('trackStart', () => received.push('start'));
    manager.on('trackEnd', () => received.push('end'));
    manager.on('playerUpdate', () => received.push('update'));
    const payload = type === 'playerUpdate'
      ? { op: 'playerUpdate', guildId: player.guildId, state: { position: 1, connected: true, ping: 25, time: Date.now() } }
      : { op: 'event', type, guildId: player.guildId, track: eventTrack, reason: 'finished' };

    await node.message({ data: JSON.stringify(payload) });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(player.current, current);
    assert.equal(current.position, 45000);
    assert.equal(player.playing, true);
    assert.equal(player.paused, true);
    assert.deepEqual(player.queue.tracks, [queued]);
    assert.equal(requests.length, before);
    assert.deepEqual(received, []);
  });
}

test('a delayed skip ignores the old end when the next request has the same encoding', async t => {
  const context = createPlayer(t);
  const { node, player, requests } = context;
  player.setAutoPlay(false);
  const old = createTrack('same');
  const next = createTrack('same');
  const last = createTrack('last');
  const oldData = await playAndStart(context, old);
  player.queue.add([next, last]);
  const started = deferred();
  const release = deferred();
  const original = node.rest.updatePlayer;
  node.rest.updatePlayer = async (guildId, payload) => {
    if (payload.track?.encoded) { started.resolve(); await release.promise; }
    return original(guildId, payload);
  };
  const skipping = player.skip();
  await started.promise;
  const ended = node.handleTrackEnd(player, { reason: 'finished', track: oldData });
  release.resolve();
  assert.equal(await skipping, true);
  await ended;

  assert.equal(player.current, next);
  assert.deepEqual(player.queue.tracks, [last]);
  assert.equal(playbackRequests(requests).length, 2);
});

test('100 duplicate ends for an empty queue emit queueEnd once', async t => {
  const context = createPlayer(t);
  const { manager, node, player } = context;
  player.setAutoPlay(false);
  const current = createTrack('last');
  const eventTrack = await playAndStart(context, current);
  const ended = [];
  manager.on('queueEnd', () => ended.push(true));
  await Promise.all(Array.from({ length: 100 }, () =>
    node.handleTrackEnd(player, { reason: 'finished', track: structuredClone(eventTrack) })));
  assert.equal(ended.length, 1);
  assert.equal(player.current, null);
});

test('track attempts preserve custom userData and the caller track serialization', async t => {
  const context = createPlayer(t);
  const { player, requests } = context;
  const current = createTrack('custom');
  current.userData = { requester: '123', custom: { value: true }, '__nyxlink': 'caller-owned' };
  const before = structuredClone(current.toJSON());
  await player.play({ track: current });
  const sent = playbackRequests(requests).at(-1).payload.track.userData;
  assert.equal(sent.requester, '123');
  assert.deepEqual(sent.custom, { value: true });
  assert.equal(sent.__nyxlink, 'caller-owned');
  assert.deepEqual(current.toJSON(), before);
});

test('100 mixed explicit commands and late ends preserve the newest user intent', async t => {
  for (let iteration = 0; iteration < 100; iteration++) {
    const context = createPlayer(t);
    const { node, player, requests } = context;
    player.setAutoPlay(false);
    const old = createTrack(`old-${iteration}`);
    const next = createTrack(`next-${iteration}`);
    const replacement = createTrack(`requested-${iteration}`);
    const eventTrack = await playAndStart(context, old);
    player.queue.add(next);
    if (iteration % 4 === 0) {
      await Promise.all([player.skip(), node.handleTrackEnd(player, { reason: 'finished', track: eventTrack })]);
      assert.equal(player.current, next);
      assert.equal(player.queue.size, 0);
    } else if (iteration % 4 === 1) {
      await Promise.all([node.handleTrackEnd(player, { reason: 'finished', track: eventTrack }), player.stop()]);
      assert.equal(player.current, null);
      assert.equal(player.playing, false);
    } else {
      const playing = player.play({ track: replacement });
      const ending = node.handleTrackEnd(player, { reason: 'finished', track: eventTrack });
      await Promise.all([playing, ending]);
      assert.equal(player.current, replacement);
      assert.equal(player.playing, true);
    }
    assert.ok(playbackRequests(requests).length <= 2);
  }
});

test('an ignored noReplace play retains the accepted attempt echoed by the backend', async t => {
  const context = createPlayer(t);
  const { node, player, requests } = context;
  player.setAutoPlay(false);
  const accepted = createTrack('accepted');
  const acceptedData = await playAndStart(context, accepted);
  accepted.position = 45000;
  player.paused = true;
  const candidate = createTrack('ignored');
  const original = node.rest.updatePlayer;
  let ignoredData;
  node.rest.updatePlayer = async (guildId, payload, noReplace) => {
    const result = await original(guildId, payload, noReplace);
    if (noReplace && payload.track?.encoded) {
      ignoredData = { ...candidate.toJSON(), userData: structuredClone(payload.track.userData ?? {}) };
      return { guildId, track: structuredClone(acceptedData), paused: true };
    }
    return result;
  };

  assert.equal(await player.play({ track: candidate, noReplace: true }), false);
  assert.equal(player.current, accepted);
  assert.equal(accepted.position, 45000);
  assert.equal(player.paused, true);
  assert.deepEqual(player.queue.tracks, [candidate]);
  const before = playbackRequests(requests).length;
  await node.handleTrackStart(player, { track: ignoredData });
  assert.equal(player.current, accepted);
  assert.equal(accepted.position, 45000);
  assert.equal(player.paused, true);
  assert.equal(playbackRequests(requests).length, before);

  await node.handleTrackEnd(player, { reason: 'finished', track: acceptedData });
  assert.equal(player.current, candidate);
  assert.equal(playbackRequests(requests).length, before + 1);
});

test('NodeLink preloaded playback is accepted when its TrackStart echoes nextTrack userData', async t => {
  const context = createPlayer(t);
  const { manager, node, player, requests } = context;
  node.backend = new NodeLinkAdapter('3.10.0', new Set(['nextTrack']));
  node.isNodeLink = true;
  player.setAutoPlay(false);
  const current = createTrack('main');
  const preloaded = createTrack('preloaded');
  const started = [];
  manager.on('trackStart', (_player, track) => started.push(track));
  await playAndStart(context, current);
  const customData = { requester: '123', custom: 'preload' };
  await player.setNextTrack(preloaded, customData);
  const payload = requests.find(({ payload }) => payload.nextTrack?.encoded === preloaded.encoded).payload.nextTrack;
  assert.equal(payload.userData.requester, customData.requester);
  assert.equal(payload.userData.custom, customData.custom);
  player.paused = true;

  await node.handleTrackStart(player, {
    track: { ...preloaded.toJSON(), userData: structuredClone(payload.userData) },
  });

  assert.equal(started.length, 2);
  assert.equal(started.at(-1).encoded, preloaded.encoded);
  assert.equal(started.at(-1).userData.custom, customData.custom);
  assert.equal(player.playing, true);
  assert.equal(player.paused, false);
  assert.deepEqual(customData, { requester: '123', custom: 'preload' });
});

test('rollback after a failed play does not revive an older loop marker', async t => {
  const context = createPlayer(t);
  const { node, player, requests } = context;
  player.setAutoPlay(false);
  player.setLoop('track');
  const current = createTrack('looped');
  const oldData = await playAndStart(context, current);
  await node.handleTrackEnd(player, { reason: 'finished', track: oldData });
  const acceptedData = echoedTrack(current, playbackRequests(requests).at(-1));
  await node.handleTrackStart(player, { track: acceptedData });
  current.position = 45000;
  player.paused = true;
  const rejected = createTrack('rejected');
  let rejectedData;
  const original = node.rest.updatePlayer;
  node.rest.updatePlayer = async (guildId, payload, noReplace) => {
    if (payload.track?.encoded === rejected.encoded) {
      requests.push({ guildId, payload });
      rejectedData = { ...rejected.toJSON(), userData: structuredClone(payload.track.userData ?? {}) };
      throw new Error('backend rejected attempted playback');
    }
    return original(guildId, payload, noReplace);
  };
  assert.equal(await player.play({ track: rejected }), false);
  assert.equal(player.current, current);
  const before = playbackRequests(requests).length;

  await node.handleTrackEnd(player, { reason: 'finished', track: oldData });
  await node.handleTrackStart(player, { track: oldData });
  await node.handleTrackStart(player, { track: rejectedData });

  assert.equal(playbackRequests(requests).length, before);
  assert.equal(player.current, current);
  assert.equal(current.position, 45000);
  assert.equal(player.paused, true);
  await node.handleTrackEnd(player, { reason: 'finished', track: acceptedData });
  assert.equal(playbackRequests(requests).length, before + 1);
});

test('collision at the transport marker key preserves public start/end metadata and snapshots', async t => {
  const context = createPlayer(t);
  const { manager, node, player, requests } = context;
  player.setAutoPlay(false);
  const probe = createTrack('probe');
  await playAndStart(context, probe);
  const key = wireMarkerKey(probe, playbackRequests(requests).at(-1));
  const current = createTrack('caller-collision');
  current.userData = { custom: { value: true }, [key]: 'application-owned' };
  const original = structuredClone(current.userData);
  const starts = [];
  const ends = [];
  manager.on('trackStart', (_player, track) => starts.push(track));
  manager.on('trackEnd', (_player, track) => ends.push(track));
  const wire = await playAndStart(context, current);
  assert.deepEqual(starts[0].userData, original);
  assert.deepEqual(TrackCodec.serialize(current).userData, original);
  assert.deepEqual(TrackCodec.restore(TrackCodec.serialize(current)).userData, original);

  await node.handleTrackEnd(player, { reason: 'finished', track: wire });
  assert.deepEqual(ends[0].userData, original);
  assert.deepEqual(current.userData, original);
});

test('snapshot cleaning never strips caller objects that resemble an attempt marker', async t => {
  const context = createPlayer(t);
  const { manager, node, player, requests } = context;
  const probe = createTrack('probe');
  await playAndStart(context, probe);
  const key = wireMarkerKey(probe, playbackRequests(requests).at(-1));
  const current = createTrack('structured-collision');
  current.userData = {
    custom: 'kept',
    [key]: { version: 1, id: '4cfec9b1-1b6b-45b3-8ac0-2b0124e03e26', hadValue: false, value: 'application-owned' },
  };
  const original = structuredClone(current.userData);
  assert.deepEqual(TrackCodec.serialize(current).userData, original);
  await player.play({ track: current });
  const wire = echoedTrack(current, playbackRequests(requests).at(-1));
  let publicTrack;
  manager.once('trackStart', (_player, track) => { publicTrack = track; });
  await node.handleTrackStart(player, { track: wire });
  const restored = TrackCodec.restore(TrackCodec.serialize(publicTrack));
  assert.deepEqual(restored.userData, original);
  assert.deepEqual(TrackCodec.serialize(restored).userData, original);
});

test('canonical public track snapshot roundtrip excludes wire identity while retaining ordinary metadata', async t => {
  const context = createPlayer(t);
  const { manager, node, player, requests } = context;
  const current = createTrack('wire-snapshot');
  current.userData = { custom: { value: true } };
  await player.play({ track: current });
  const wire = echoedTrack(current, playbackRequests(requests).at(-1));
  let publicTrack;
  manager.once('trackStart', (_player, track) => { publicTrack = track; });
  await node.handleTrackStart(player, { track: wire });
  const snapshot = TrackCodec.serialize(publicTrack);
  assert.deepEqual(snapshot.userData, { custom: { value: true } });
  assert.deepEqual(TrackCodec.restore(snapshot).userData, current.userData);
});

test('legacy untagged loop events can complete multiple real iterations', async t => {
  const context = createPlayer(t);
  const { node, player, requests } = context;
  player.setAutoPlay(false);
  player.setLoop('track');
  const current = createTrack('legacy-loop');
  await player.play({ track: current });
  for (let iteration = 0; iteration < 3; iteration++) {
    await node.handleTrackStart(player, { track: current.toJSON() });
    await node.handleTrackEnd(player, { reason: 'finished', track: current.toJSON() });
    // A duplicate end arriving before the new start must not consume another iteration.
    await node.handleTrackEnd(player, { reason: 'finished', track: current.toJSON() });
  }
  assert.equal(playbackRequests(requests).length, 4);
});

test('failed overlapping preload updates retain the last accepted preload rather than reviving a rejected one', async t => {
  const context = createPlayer(t);
  const { manager, node, player, requests } = context;
  node.backend = new NodeLinkAdapter('3.10.0', new Set(['nextTrack']));
  node.isNodeLink = true;
  player.setAutoPlay(false);
  const current = createTrack('main');
  await playAndStart(context, current);
  const accepted = createTrack('accepted-preload');
  await player.setNextTrack(accepted);
  const acceptedPayload = requests.find(({ payload }) => payload.nextTrack?.encoded === accepted.encoded).payload.nextTrack;
  const first = createTrack('first-rejected');
  const second = createTrack('second-rejected');
  const firstResponse = deferred();
  const secondResponse = deferred();
  node.rest.updatePlayer = async (guildId, payload) => {
    requests.push({ guildId, payload });
    if (payload.nextTrack?.encoded === first.encoded) return firstResponse.promise;
    if (payload.nextTrack?.encoded === second.encoded) return secondResponse.promise;
    return payload;
  };
  const updatingFirst = player.setNextTrack(first);
  const updatingSecond = player.setNextTrack(second);
  const firstRejected = assert.rejects(updatingFirst, /first rejected/);
  const secondRejected = assert.rejects(updatingSecond, /second rejected/);
  firstResponse.reject(new Error('first rejected'));
  await firstRejected;
  secondResponse.reject(new Error('second rejected'));
  await secondRejected;
  const started = [];
  manager.on('trackStart', (_player, track) => started.push(track));

  await node.handleTrackStart(player, {
    track: { ...accepted.toJSON(), userData: structuredClone(acceptedPayload.userData ?? {}) },
  });

  assert.equal(started.length, 1);
  assert.equal(started[0].encoded, accepted.encoded);
  assert.equal(player.current.encoded, accepted.encoded);
});

test('a failed explicit play retains an already accepted preload from the previous command generation', async t => {
  const context = createPlayer(t);
  const { manager, node, player, requests } = context;
  node.backend = new NodeLinkAdapter('3.10.0', new Set(['nextTrack']));
  node.isNodeLink = true;
  player.setAutoPlay(false);
  await playAndStart(context, createTrack('main'));
  const preloaded = createTrack('accepted-preload');
  await player.setNextTrack(preloaded);
  const acceptedPayload = requests.find(({ payload }) => payload.nextTrack?.encoded === preloaded.encoded).payload.nextTrack;
  const rejected = createTrack('rejected-explicit');
  node.rest.updatePlayer = async () => { throw new Error('explicit play rejected'); };
  assert.equal(await player.play({ track: rejected }), false);
  const started = [];
  manager.on('trackStart', (_player, track) => started.push(track));

  await node.handleTrackStart(player, {
    track: { ...preloaded.toJSON(), userData: structuredClone(acceptedPayload.userData ?? {}) },
  });

  assert.equal(started.length, 1);
  assert.equal(started[0].encoded, preloaded.encoded);
  assert.equal(player.current.encoded, preloaded.encoded);
});

for (const positional of [false, true]) {
  test(`100 simultaneous ${positional ? 'positional' : 'normal'} skips consume one queued track`, async t => {
    const context = createPlayer(t);
    const { player, requests } = context;
    player.setAutoPlay(false);
    await playAndStart(context, createTrack('current'));
    const queued = Array.from({ length: 100 }, (_, index) => createTrack(`queued-${index}`));
    player.queue.add(queued);

    const results = await Promise.all(Array.from({ length: 100 }, () => positional ? player.skip(0) : player.skip()));

    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(player.current, queued[0]);
    assert.deepEqual(player.queue.tracks, queued.slice(1));
    assert.equal(playbackRequests(requests).length, 2);
  });
}

test('a later stop supersedes positional skips without discarding their queued tracks', async t => {
  const context = createPlayer(t);
  const { player, requests } = context;
  player.setAutoPlay(false);
  await playAndStart(context, createTrack('current'));
  const queued = Array.from({ length: 100 }, (_, index) => createTrack(`queued-${index}`));
  player.queue.add(queued);
  const skipping = Array.from({ length: 100 }, () => player.skip(0));
  const stopping = player.stop();
  const results = await Promise.all(skipping);
  await stopping;

  assert.equal(results.filter(Boolean).length, 0);
  assert.equal(player.current, null);
  assert.deepEqual(player.queue.tracks, queued);
  assert.equal(playbackRequests(requests).length, 1);
});

for (const tagged of [true, false]) {
  test(`duplicate current ${tagged ? 'tagged' : 'legacy'} TrackStart events preserve pause and position`, async t => {
    const context = createPlayer(t);
    const { manager, node, player } = context;
    player.setAutoPlay(false);
    const current = createTrack('current');
    const wire = await playAndStart(context, current);
    current.position = 45000;
    player.paused = true;
    const started = [];
    manager.on('trackStart', () => started.push(true));
    await Promise.all(Array.from({ length: 100 }, () => node.handleTrackStart(player, {
      track: tagged ? structuredClone(wire) : current.toJSON(),
    })));

    assert.equal(current.position, 45000);
    assert.equal(player.paused, true);
    assert.equal(player.playing, true);
    assert.deepEqual(started, []);
  });
}

for (const hadValue of [false, true]) {
  test(`fresh legacy current keeps marker-shaped caller data with hadValue=${hadValue}`, async t => {
    const probeContext = createPlayer(t);
    const probe = createTrack('marker-probe');
    await playAndStart(probeContext, probe);
    const key = wireMarkerKey(probe, playbackRequests(probeContext.requests).at(-1));
    const { manager, node, player } = createPlayer(t);
    player.setAutoPlay(false);
    const current = createTrack('legacy-current');
    current.userData = {
      custom: 'application-data',
      [key]: { version: 1, id: '4cfec9b1-1b6b-45b3-8ac0-2b0124e03e26', hadValue, value: 'application-owned' },
    };
    const original = structuredClone(current.userData);
    // Restored/manual current has not passed through play() or transport decoration.
    player.current = current;
    const starts = [];
    const ends = [];
    const empty = [];
    manager.on('trackStart', (_player, track) => starts.push(track));
    manager.on('trackEnd', (_player, track) => ends.push(track));
    manager.on('queueEnd', () => empty.push(true));

    await node.handleTrackStart(player, { track: current.toJSON() });
    assert.equal(starts.length, 1);
    assert.deepEqual(starts[0].userData, original);
    await node.handleTrackEnd(player, { reason: 'finished', track: current.toJSON() });

    assert.equal(ends.length, 1);
    assert.deepEqual(ends[0].userData, original);
    assert.deepEqual(current.userData, original);
    assert.equal(empty.length, 1);
    assert.equal(player.current, null);
  });
}
