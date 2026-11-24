const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, Track, BackendDetector } = require('../dist');
const { NodeState } = require('../dist/src/typings/types');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

function target(manager) {
  const node = new Node(manager, { identifier: 'target', host: '127.0.0.1', port: 2440, password: 'test' });
  node.backend = BackendDetector.detect({ isNodelink: true, version: { semver: '3.10.0' } });
  node.isNodeLink = true; node.connected = true; node.state = NodeState.READY;
  node.rest.updatePlayer = async (_guild, payload) => payload;
  node.rest.destroyPlayer = async () => {};
  manager.nodes.nodes.set(node.identifier, node);
  return node;
}

function migrated(track) { return { ...track.toJSON(), encoded: 'destination-encoding' }; }

test('track snapshots restore opaque encodings with metadata, requester and backend provenance', () => {
  const { TrackCodec } = require('../dist/src/tracks/TrackCodec');
  const track = createTrack('opaque'); track.backend = 'nodelink'; track.position = 45000;
  track.setRequester({ id: 'requester' }); track.userData.custom = 'kept'; track.origin = 'original';
  const snapshot = JSON.parse(JSON.stringify(TrackCodec.serialize(track)));
  const restored = TrackCodec.restore(snapshot);
  assert.equal(restored.encoded, track.encoded);
  assert.equal(restored.position, 45000);
  assert.deepEqual(restored.userData, track.userData);
  assert.deepEqual(restored.requester, track.requester);
  assert.equal(restored.backend, 'nodelink'); assert.equal(restored.origin, 'original');
});

test('cross-backend transfer loads destination encoding before deleting the original player', async t => {
  const { manager, node: source, player } = createPlayer(t);
  source.backend = BackendDetector.detect({ version: { semver: '4.2.2' } });
  const destination = target(manager);
  const current = createTrack('current'); current.backend = 'lavalink'; current.position = 12000;
  player.current = current; player.paused = true; player.playing = true;
  const queued = createTrack('queued'); queued.backend = 'lavalink'; player.queue.add(queued);
  player.voice.connect = async () => {};
  let originalDeleted = false;
  source.rest.destroyPlayer = async () => { originalDeleted = true; };
  destination.rest.loadTracks = async identifier => {
    assert.equal(originalDeleted, false); assert.equal(identifier, current.uri);
    return { loadType: 'track', data: migrated(current) };
  };
  const payloads = [];
  destination.rest.updatePlayer = async (_guild, payload) => { payloads.push(payload); return payload; };
  assert.equal(await player.transferNode(destination), true);
  assert.equal(player.current.encoded, 'destination-encoding');
  assert.equal(player.current.backend, 'nodelink');
  assert.equal(player.current.position, 12000); assert.equal(player.paused, true);
  assert.deepEqual(player.queue.tracks, [queued]);
  assert.equal(payloads.find(p => p.track?.encoded).track.encoded, 'destination-encoding');
});

test('failed track resolution leaves the original node, current track and queue intact', async t => {
  const { manager, node: source, player } = createPlayer(t);
  source.backend = BackendDetector.detect({ version: { semver: '4.2.2' } });
  const destination = target(manager);
  player.current = createTrack('current');
  let deleted = false; source.rest.destroyPlayer = async () => { deleted = true; };
  destination.rest.loadTracks = async () => ({ loadType: 'empty', data: {} });
  const original = player.current;
  assert.equal(await player.transferNode(destination), false);
  assert.equal(deleted, false); assert.equal(player.node, source); assert.equal(player.current, original);
});

test('stop cancels deferred cross-backend resolution before cleanup or playback', async t => {
  const { manager, node: source, player } = createPlayer(t);
  source.backend = BackendDetector.detect({ version: { semver: '4.2.2' } });
  const destination = target(manager); const current = createTrack('current'); player.current = current;
  const started = deferred(); const release = deferred();
  destination.rest.loadTracks = async () => { started.resolve(); return release.promise; };
  let deleted = false; source.rest.destroyPlayer = async () => { deleted = true; };
  const moving = player.transferNode(destination);
  // Baseline does not resolve tracks; allow the baseline failure to complete without hanging.
  await Promise.race([started.promise, moving]);
  const stopping = player.stop(); release.resolve({ loadType: 'track', data: migrated(current) });
  assert.equal(await moving, false); await stopping;
  assert.equal(deleted, false); assert.equal(player.current, null);
});

test('queued tracks from another backend are resolved lazily on play', async t => {
  const { manager, player } = createPlayer(t); player.node = target(manager);
  const queued = createTrack('queued'); queued.backend = 'lavalink'; queued.userData.custom = 'kept';
  player.queue.add(queued);
  player.node.rest.loadTracks = async () => ({ loadType: 'track', data: migrated(queued) });
  assert.equal(await player.play(), true);
  assert.equal(player.current.encoded, 'destination-encoding');
  assert.equal(player.current.userData.custom, 'kept'); assert.equal(player.current.backend, 'nodelink');
});

test('transfer persists inferred backend provenance for legacy queue and history tracks', async t => {
  const { manager, node: source, player } = createPlayer(t);
  source.backend = BackendDetector.detect({ version: { semver: '4.2.2' } });
  const destination = target(manager);
  const queued = createTrack('legacy-queue');
  const previous = createTrack('legacy-history');
  player.queue.add(queued);
  player.previous.push(previous);
  await player.updateData('previous', [previous.toJSON()]);
  player.voice.connect = async () => {};
  assert.equal(await player.transferNode(destination), true);
  await manager.database.flush();
  const saved = await manager.database.get(`players.${player.guildId}`);
  assert.equal(queued.backend, 'lavalink');
  assert.equal(previous.backend, 'lavalink');
  assert.equal(saved.queue[0].backend, 'lavalink');
  assert.equal(saved.previous[0].backend, 'lavalink');
});

test('stop during deferred queued-track resolution retains the original queued track', async t => {
  const { manager, player } = createPlayer(t);
  player.node = target(manager);
  const queued = createTrack('queued'); queued.backend = 'lavalink';
  player.queue.add(queued);
  const started = deferred();
  const release = deferred();
  player.node.rest.loadTracks = async () => { started.resolve(); return release.promise; };
  const playback = [];
  player.node.rest.updatePlayer = async (_guild, payload) => { playback.push(payload); return payload; };
  const playing = player.play();
  await Promise.race([started.promise, playing]);
  const stopping = player.stop();
  release.resolve({ loadType: 'track', data: migrated(queued) });
  assert.equal(await playing, false);
  await stopping;
  assert.deepEqual(player.queue.tracks, [queued]);
  assert.equal(player.current, null);
  assert.equal(playback.some(payload => payload.track?.encoded), false);
});

test('metadata snapshots and legacy encoded-only records both reconstruct Player tracks', async t => {
  const { TrackCodec, Player } = require('../dist');
  const { manager, node } = createPlayer(t);
  const original = createTrack('legacy'); original.backend = 'lavalink'; original.position = 27000;
  const legacy = { encoded: TrackCodec.encode(original.toJSON().info), requester: { id: 'legacy-requester' }, position: 1234 };
  assert.equal(TrackCodec.restore(legacy).position, 1234);
  const restored = new Player(manager, node, {
    guildId: '423456789012345678', voiceChannelId: '223456789012345678',
    current: TrackCodec.serialize(original), queue: [TrackCodec.serialize(original)], previous: [legacy],
  });
  restored.stopHealthCheck(); t.after(() => restored.voice.destroy());
  assert.equal(restored.current.encoded, original.encoded);
  assert.equal(restored.current.position, 27000);
  assert.equal(restored.queue.first.backend, 'lavalink');
  assert.equal(restored.previous[0].requester.id, 'legacy-requester');
});

test('invalid destination metadata is rejected before replacing the original player', async t => {
  const { manager, node: source, player } = createPlayer(t);
  source.backend = BackendDetector.detect({ version: { semver: '4.2.2' } });
  player.current = createTrack('current'); const destination = target(manager);
  destination.rest.loadTracks = async () => ({ loadType: 'track', data: { encoded: 'bad', info: {} } });
  let deleted = false; source.rest.destroyPlayer = async () => { deleted = true; };
  assert.equal(await player.transferNode(destination), false);
  assert.equal(deleted, false); assert.equal(player.node, source);
});

test('NodeLink HTTP tracks preserve the documented unknown-duration sentinel', async t => {
  const { TrackResolver } = require('../dist');
  const { manager, node } = createPlayer(t);
  node.backend = BackendDetector.detect({ version: { semver: '4.2.2' } });
  const destination = target(manager); const original = createTrack('http'); original.backend = 'lavalink';
  const data = migrated(original); data.info.length = -1;
  destination.rest.loadTracks = async () => ({ loadType: 'track', data });
  const resolved = await TrackResolver.resolve(original, destination, node);
  assert.equal(resolved.duration, -1);
  assert.equal(resolved.backend, 'nodelink');
});

test('partial tracks retain source URI and complete duration during cross-backend resolution', async t => {
  const {manager,player}=createPlayer(t);
  const destination=target(manager);
  const record=createTrack('partial').toJSON();
  const partial=new Track(record,undefined,undefined,['title']);
  partial.backend='lavalink';
  player.queue.add(partial);
  assert.equal(partial.uri,undefined);
  assert.equal(player.queue.duration,180000);
  destination.rest.loadTracks=async uri=>{
    assert.equal(uri,record.info.uri);
    return {loadType:'track',data:{...record,encoded:'target-partial'}};
  };
  const {TrackResolver}=require('../dist');
  const resolved=await TrackResolver.resolve(partial,destination);
  assert.equal(resolved.encoded,'target-partial');
  assert.equal(resolved.getInfo().length,180000);
});

test('stop aborts an in-flight destination track lookup instead of waiting for its timeout', async t => {
  const { manager, player } = createPlayer(t);
  const destination = target(manager);
  player.node = destination;
  const queued = createTrack('cancelled-network-lookup');
  queued.backend = 'lavalink';
  player.queue.add(queued);
  const entered = deferred();
  let signal;
  destination.rest.loadTracks = async (_uri, options) => {
    signal = options.signal;
    entered.resolve();
    return new Promise((_resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  };
  const playing = player.play();
  await entered.promise;
  const stopping = player.stop();
  assert.equal(signal.aborted, true, 'stop must immediately cancel the active HTTP request');
  assert.equal(await playing, false);
  await stopping;
  assert.deepEqual(player.queue.tracks, [queued]);
  assert.equal(player.current, null);
});

test('PlaybackGuard invalidates the previous network signal but not the next intent', () => {
  const { PlaybackGuard } = require('../dist/src/players/PlaybackGuard');
  const guard = new PlaybackGuard();
  const initialSignal = guard.signal;
  const initialTicket = guard.ticket;
  const currentTicket = guard.invalidate();
  assert.equal(initialSignal.aborted, true);
  assert.equal(guard.isCurrent(initialTicket), false);
  assert.equal(guard.isCurrent(currentTicket), true);
  assert.equal(guard.signal.aborted, false);
  guard.invalidate();
  assert.equal(guard.signal.aborted, false);
  assert.equal(initialSignal.aborted, true);
});

test('stop aborts a pending cross-backend migration lookup before source cleanup', async t => {
  const { manager, node: source, player } = createPlayer(t);
  source.backend = BackendDetector.detect({ version: { semver: '4.2.2' } });
  const destination = target(manager);
  const current = createTrack('migration-lookup-abort');
  current.backend = 'lavalink';
  player.current = current;
  const entered = deferred();
  let signal;
  destination.rest.loadTracks = async (_uri, options) => {
    signal = options.signal;
    entered.resolve();
    return new Promise((_resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  };
  let sourceDestroyed = false;
  source.rest.destroyPlayer = async () => { sourceDestroyed = true; };
  const moving = player.transferNode(destination);
  await entered.promise;
  const stopping = player.stop();
  assert.equal(signal.aborted, true);
  assert.equal(await moving, false);
  await stopping;
  assert.equal(sourceDestroyed, false, 'cancelled migration must never delete the source player');
  assert.equal(player.node, source);
});

test('destination resolution discards an encoding returned after its session rotates', async t => {
  const { manager, node: source } = createPlayer(t);
  const destination = target(manager);
  const original = createTrack('session-rotated');
  original.backend = 'lavalink';
  const entered = deferred(), pending = deferred();
  destination.rest.loadTracks = async () => { entered.resolve(); return pending.promise; };
  const { TrackResolver } = require('../dist');
  const resolving = TrackResolver.resolve(original, destination, source);
  const rejected = assert.rejects(resolving, /Destination node changed/i);
  await entered.promise;
  destination.sessionId = 'replacement-session';
  pending.resolve({ loadType: 'track', data: migrated(original) });
  await rejected;
  assert.equal(original.encoded, 'encoded-session-rotated');
  assert.equal(original.backend, 'lavalink');
});

test('destination resolution discards an encoding after the registered node is replaced', async t => {
  const { manager, node: source } = createPlayer(t);
  const destination = target(manager);
  const original = createTrack('node-replaced');
  original.backend = 'lavalink';
  const entered = deferred(), pending = deferred();
  destination.rest.loadTracks = async () => { entered.resolve(); return pending.promise; };
  const { TrackResolver } = require('../dist');
  const resolving = TrackResolver.resolve(original, destination, source);
  const rejected = assert.rejects(resolving, /Destination node changed/i);
  await entered.promise;
  const replacement = target(manager);
  assert.notEqual(replacement, destination);
  pending.resolve({ loadType: 'track', data: migrated(original) });
  await rejected;
  assert.equal(original.encoded, 'encoded-node-replaced');
});

test('stop releases a pending direct URL lookup even when the REST adapter ignores abort', async t => {
  const { manager, player } = createPlayer(t);
  const destination = target(manager);
  player.node = destination;
  const queued = createTrack('direct-abort-ignored');
  queued.backend = 'lavalink';
  player.queue.add(queued);
  const entered = deferred();
  let activeSignal;
  destination.rest.loadTracks = async (_uri, { signal }) => {
    activeSignal = signal;
    entered.resolve();
    return new Promise(() => {});
  };
  const playing = player.play();
  await entered.promise;
  const stopping = player.stop();
  assert.equal(activeSignal.aborted, true);
  assert.equal(await playing, false, 'a cancelled lookup must unblock the player command queue');
  await stopping;
  assert.deepEqual(player.queue.tracks, [queued]);
  assert.equal(player.current, null);
});

test('direct URL lookup consumes late backend rejection after user cancellation', async t => {
  const { manager, player } = createPlayer(t);
  const destination = target(manager);
  player.node = destination;
  const queued = createTrack('late-direct-reject');
  queued.backend = 'lavalink';
  player.queue.add(queued);
  const entered = deferred(), pending = deferred();
  destination.rest.loadTracks = async () => { entered.resolve(); return pending.promise; };
  const playing = player.play();
  await entered.promise;
  const stopping = player.stop();
  assert.equal(await playing, false);
  await stopping;
  pending.reject(new Error('late backend failure after stop'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(player.queue.tracks, [queued]);
});

test('destination URI errors cannot be bypassed with metadata source fallback', async t => {
  const { manager, node: source } = createPlayer(t);
  const destination = target(manager);
  manager.options.search = { trackResolution: { sources: ['youtube'] } };
  const song = createTrack('provider-rejection');
  song.backend = 'lavalink';
  const { TrackResolver } = require('../dist');
  let calls = 0;
  destination.rest.loadTracks = async () => {
    calls++;
    return { loadType: 'error', data: { message: 'HTTP 429: provider rate limit' } };
  };
  await assert.rejects(TrackResolver.resolve(song, destination, source), /Destination rejected/i);
  assert.equal(calls, 1, 'a backend error must not trigger the metadata fallback');
  destination.rest.loadTracks = async () => {
    calls++;
    throw new Error('HTTP 401');
  };
  await assert.rejects(TrackResolver.resolve(song, destination, source), /HTTP 401/);
  assert.equal(calls, 2, 'authorization errors must not be retried across fallback sources');
});

test('invalid direct URI protocol responses fail before metadata fallback', async t => {
  const { manager, node: source } = createPlayer(t);
  const destination = target(manager);
  manager.options.search = { trackResolution: { sources: ['youtube'] } };
  const song = createTrack('invalid-direct-data');
  song.backend = 'lavalink';
  const { TrackResolver } = require('../dist');
  let calls = 0;
  destination.rest.loadTracks = async () => {
    calls++;
    return { loadType: 'search', data: { incorrect: true } };
  };
  await assert.rejects(TrackResolver.resolve(song, destination, source), /Invalid search response/i);
  assert.equal(calls, 1, 'malformed direct response must not be treated as empty');
});

test('destination track decoding respects explicitly disabled source policy', async t => {
  const { manager, node: source } = createPlayer(t);
  const destination = target(manager);
  manager.options.sources.disabledSources = ['youtube'];
  const song = createTrack('blocked-on-destination');
  song.backend = 'lavalink';
  const { TrackResolver } = require('../dist');
  destination.rest.loadTracks = async () => ({ loadType: 'track', data: migrated(song) });
  await assert.rejects(
    TrackResolver.resolve(song, destination, source),
    /disabled track source/i,
  );
  assert.equal(song.backend, 'lavalink');
  assert.equal(song.encoded, 'encoded-blocked-on-destination');
});
