const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Manager, Memory, Local, PlayerSnapshotCodec, TrackCodec, BackendDetector } = require('../dist');
const { DatabaseManager } = require('../dist/src/managers/DatabaseManager');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

const guild = '123456789012345678';
const voiceChannel = '223456789012345678';
const key = `players.${guild}`;
const revisionA = '11111111-1111-4111-8111-111111111111';
const revisionB = '22222222-2222-4222-8222-222222222222';

function snapshot(revision = null) {
  return { schemaVersion: 1, revision, data: {
    guildId: guild, voiceChannelId: voiceChannel, node: 'snapshot-node',
    current: null, queue: [], previous: [], volume: 62,
    playing: false, paused: true, autoPlay: false, autoLeave: false, loop: 'off',
  } };
}

function database(t, adapter = new Memory()) {
  const manager = new Manager({ nodes: [{ identifier: 'snapshot-node', host: '127.0.0.1', port: 2333, password: 'test' }],
    options: { database: { type: 'memory', adapter } } });
  manager.database = new DatabaseManager(manager);
  t.after(() => manager.database.shutdown());
  return { manager, db: manager.database, adapter };
}

async function localDatabase(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxlink-snapshot-'));
  const context = database(t, new Local());
  context.manager.clientId = 'snapshot-test';
  context.manager.options.database.options = { path: directory };
  await context.db.initialize();
  const extra = new Set();
  t.after(async () => {
    for (const provider of extra) await provider.shutdown();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { ...context, directory, extra };
}

test('legacy player records become a versioned snapshot without inventing a stored revision', () => {
  const legacy = { guildId: guild, voiceChannelId: voiceChannel, volume: 35, queue: [] };
  const parsed = PlayerSnapshotCodec.fromRecord(legacy);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.revision, null);
  assert.equal(parsed.data.guildId, guild);
  assert.equal(parsed.data.volume, 35);
  assert.deepEqual(parsed.data.queue, []);
  assert.equal(parsed.data.current, null);
  assert.equal(legacy.schemaVersion, undefined);
});

test('JSON snapshot parsing preserves detached track metadata and backend identity', () => {
  const input = snapshot(revisionA);
  const track = createTrack('imported');
  track.backend = 'nodelink';
  track.position = 45000;
  track.requester = { id: 'requester' };
  track.userData = { requester: track.requester, custom: { retained: true } };
  track.pluginInfo = { source: { plugin: 'fixture' } };
  input.data.current = TrackCodec.serialize(track);
  input.data.queue = [TrackCodec.serialize(createTrack('queued'))];
  input.data.previous = [TrackCodec.serialize(createTrack('previous'))];
  const parsed = PlayerSnapshotCodec.parse(JSON.stringify(input));
  assert.equal(parsed.revision, revisionA);
  assert.equal(parsed.data.current.backend, 'nodelink');
  assert.equal(parsed.data.current.info.position, 45000);
  assert.deepEqual(parsed.data.current.requester, { id: 'requester' });
  assert.deepEqual(parsed.data.current.pluginInfo, track.pluginInfo);
  parsed.data.current.userData.custom.retained = false;
  assert.equal(input.data.current.userData.custom.retained, true);
});

test('snapshot parsing rejects malformed JSON and unknown schema versions', () => {
  assert.equal(typeof PlayerSnapshotCodec?.parse, 'function');
  for (const input of ['{broken', null, [], { ...snapshot(), schemaVersion: 2 }]) {
    assert.throws(() => PlayerSnapshotCodec.parse(input));
  }
});

test('snapshot parsing rejects unsafe identifiers and invalid revision values', () => {
  assert.equal(typeof PlayerSnapshotCodec?.parse, 'function');
  for (const data of [{ guildId: '__proto__' }, { voiceChannelId: 'invalid' }, { node: 5 }]) {
    const input = snapshot();
    Object.assign(input.data, data);
    assert.throws(() => PlayerSnapshotCodec.parse(input));
  }
  assert.throws(() => PlayerSnapshotCodec.parse({ ...snapshot(), revision: 4 }));
});

test('snapshot parsing rejects invalid playback bounds and malformed track lists', () => {
  assert.equal(typeof PlayerSnapshotCodec?.parse, 'function');
  for (const value of [-1, 1001, Infinity, NaN]) {
    const input = snapshot();
    input.data.volume = value;
    assert.throws(() => PlayerSnapshotCodec.parse(input));
  }
  const negative = snapshot();
  negative.data.current = TrackCodec.serialize(createTrack('negative'));
  negative.data.current.info.position = -1;
  assert.throws(() => PlayerSnapshotCodec.parse(negative));
  for (const queue of [{}, [{ encoded: '' }], [{ encoded: 'opaque', info: { length: NaN } }]]) {
    const input = snapshot();
    input.data.queue = queue;
    assert.throws(() => PlayerSnapshotCodec.parse(input));
  }
});

test('snapshot codecs whitelist config fields instead of exporting voice or transport credentials', () => {
  const legacy = { ...snapshot().data, voice: { token: 'voice-secret', sessionId: 'voice-session' },
    token: 'bot-secret', password: 'node-secret', socket: { transport: true } };
  const parsed = PlayerSnapshotCodec.fromRecord(legacy);
  for (const secret of ['voice-secret', 'voice-session', 'bot-secret', 'node-secret', 'transport']) {
    assert.equal(JSON.stringify(parsed).includes(secret), false);
  }
  assert.equal(parsed.data.voiceChannelId, voiceChannel);
});

test('each normal player field write advances the root revision and retains other state', async t => {
  const { db } = database(t);
  await db.set(key, snapshot().data);
  const initial = await db.exportPlayer(guild);
  assert.equal(initial.schemaVersion, 1);
  assert.equal(typeof initial.revision, 'string');
  assert.ok(initial.revision.length > 0);
  await db.set(`${key}.volume`, 80);
  const changed = await db.exportPlayer(guild);
  assert.notEqual(changed.revision, initial.revision);
  assert.equal(changed.data.volume, 80);
  assert.equal(changed.data.paused, true);
  assert.equal(await db.get(`${key}.revision`), changed.revision);
});

test('concurrent player field writes merge their changes without losing siblings', async t => {
  const { db } = database(t);
  await db.set(key, snapshot().data);
  await Promise.all(Array.from({ length: 40 }, (_, index) => db.set(`${key}.custom.field${index}`, index)));
  const stored = await db.get(`${key}.custom`);
  for (let index = 0; index < 40; index++) assert.equal(stored[`field${index}`], index);
  assert.equal(await db.get(`${key}.voiceChannelId`), voiceChannel);
});

test('exporting an absent player returns undefined without creating storage state', async t => {
  const { db } = database(t);
  assert.equal(await db.exportPlayer(guild), undefined);
  assert.equal(await db.has(key), false);
});

test('import replaces stored state with a new revision without creating a live player or audio', async t => {
  const { db, manager } = database(t);
  const input = snapshot();
  input.data.queue.push(TrackCodec.serialize(createTrack('saved-queue')));
  input.data.filters = { timescale: { speed: 1.2, pitch: 1.2, rate: 1 }, activeFilters: ['nightcore'] };
  await db.importPlayer(JSON.stringify(input), null);
  const stored = await db.exportPlayer(guild);
  assert.equal(typeof stored.revision, 'string');
  assert.notEqual(stored.revision, input.revision);
  assert.equal(stored.data.queue[0].encoded, 'encoded-saved-queue');
  assert.deepEqual(stored.data.filters, input.data.filters);
  assert.equal(manager.players.size, 0);
  assert.equal(manager.nodes.nodes.size, 0);
});

test('a snapshot exported before a newer field write cannot overwrite that newer state', async t => {
  const { db } = database(t);
  await db.set(key, snapshot().data);
  const saved = await db.exportPlayer(guild);
  await db.set(`${key}.volume`, 81);
  await assert.rejects(db.importPlayer(saved, saved.revision), { code: 'SNAPSHOT_CONFLICT' });
  assert.equal(await db.get(`${key}.volume`), 81);
});

test('import refuses an active player without changing its local or stored state', async t => {
  const { player, manager } = createPlayer(t);
  await manager.database.set(key, snapshot().data);
  const before = await manager.database.get(key);
  const incoming = snapshot();
  incoming.data.volume = 25;
  await assert.rejects(manager.database.importPlayer(incoming, before.revision));
  assert.equal(player.volume, 100);
  assert.deepEqual(await manager.database.get(key), before);
});

test('two imports with one expected revision cannot both commit', async t => {
  const { db } = database(t);
  await db.set(key, snapshot().data);
  const before = await db.exportPlayer(guild);
  const first = structuredClone(before);
  const second = structuredClone(before);
  first.data.volume = 31;
  second.data.volume = 32;
  const outcomes = await Promise.allSettled([db.importPlayer(first, before.revision), db.importPlayer(second, before.revision)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'SNAPSHOT_CONFLICT');
  assert.ok([31, 32].includes((await db.exportPlayer(guild)).data.volume));
});

test('delete and recreation cannot make an old snapshot revision current again', async t => {
  const { db } = database(t);
  await db.set(key, snapshot().data);
  const old = await db.exportPlayer(guild);
  await db.remove(key);
  await db.set(key, snapshot().data);
  const recreated = await db.exportPlayer(guild);
  assert.notEqual(recreated.revision, old.revision);
  await assert.rejects(db.importPlayer(old, old.revision), { code: 'SNAPSHOT_CONFLICT' });
  assert.equal((await db.exportPlayer(guild)).revision, recreated.revision);
});

test('Memory compare-and-set gives exactly one concurrent writer the original revision', async () => {
  const adapter = new Memory();
  await adapter.set(key, { revision: revisionA, volume: 10 });
  const outcomes = await Promise.all([
    adapter.compareAndSet(key, revisionA, { revision: revisionB, volume: 20 }),
    adapter.compareAndSet(key, revisionA, { revision: '33333333-3333-4333-8333-333333333333', volume: 30 }),
  ]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.ok([20, 30].includes((await adapter.get(key)).volume));
});

test('Memory CAS treats null as absent or legacy state and deletion is conditional', async () => {
  const adapter = new Memory();
  await adapter.set(key, { volume: 10 });
  assert.equal(await adapter.compareAndSet(key, null, { revision: revisionA, volume: 20 }), true);
  assert.equal(await adapter.compareAndSet(key, null, { revision: revisionB }), false);
  assert.equal(await adapter.compareAndSet(key, revisionB, undefined), false);
  assert.equal(await adapter.compareAndSet(key, revisionA, undefined), true);
  assert.equal(await adapter.has(key), false);
  assert.equal(await adapter.compareAndSet(key, null, { revision: revisionB, volume: 30 }), true);
});

test('Local CAS writes retain revision and track metadata across a graceful reopen', async t => {
  const { adapter, directory, manager, extra } = await localDatabase(t);
  const initial = { ...snapshot().data, schemaVersion: 1, revision: revisionA };
  initial.queue.push(TrackCodec.serialize(createTrack('local-queue')));
  await adapter.set(key, initial);
  assert.equal(await adapter.compareAndSet(key, revisionA, { ...initial, revision: revisionB, volume: 77 }), true);
  await adapter.shutdown();
  const reopened = new Local();
  await reopened.init(manager, { path: directory });
  extra.add(reopened);
  const stored = await reopened.get(key);
  assert.equal(stored.revision, revisionB);
  assert.equal(stored.volume, 77);
  assert.equal(stored.queue[0].encoded, 'encoded-local-queue');
  assert.equal(await reopened.compareAndSet(key, revisionA, { ...stored, volume: 4 }), false);
});

test('a Local CAS disk failure preserves the last acknowledged revision and value', async t => {
  const { adapter, directory } = await localDatabase(t);
  await adapter.set(key, { revision: revisionA, volume: 30 });
  const appendFile = fs.appendFile;
  fs.appendFile = async (file, ...args) => {
    if (file === path.join(directory, 'data.snapshot-test.wal')) throw Object.assign(new Error('fixture disk full'), { code: 'ENOSPC' });
    return appendFile(file, ...args);
  };
  try {
    await assert.rejects(adapter.compareAndSet(key, revisionA, { revision: revisionB, volume: 40 }), { code: 'ENOSPC' });
  } finally { fs.appendFile = appendFile; }
  assert.deepEqual(await adapter.get(key), { revision: revisionA, volume: 30 });
});

test('custom adapters without CAS still support ordered snapshot storage within one manager', async t => {
  const backing = new Memory();
  const adapter = Object.fromEntries(['init', 'get', 'set', 'remove', 'has', 'keys', 'clear', 'shutdown'].map(name => [name, backing[name].bind(backing)]));
  const { db } = database(t, adapter);
  await db.importPlayer(snapshot(), null);
  const before = await db.exportPlayer(guild);
  await db.set(`${key}.volume`, 90);
  await assert.rejects(db.importPlayer(before, before.revision), { code: 'SNAPSHOT_CONFLICT' });
  assert.equal((await db.exportPlayer(guild)).data.volume, 90);
});

test('two managers sharing an atomic adapter cannot both import against the same revision', async t => {
  const adapter = new Memory();
  const first = database(t, adapter);
  const second = database(t, adapter);
  await first.db.set(key, snapshot().data);
  const before = await first.db.exportPlayer(guild);
  const one = structuredClone(before);
  const two = structuredClone(before);
  one.data.volume = 19;
  two.data.volume = 29;
  const results = await Promise.allSettled([
    first.db.importPlayer(one, before.revision), second.db.importPlayer(two, before.revision),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'SNAPSHOT_CONFLICT');
  assert.ok([19, 29].includes((await first.db.exportPlayer(guild)).data.volume));
});

test('live export waits behind a pending stop and captures its final playback state', async t => {
  const { player, node } = createPlayer(t);
  player.current = createTrack('stopping');
  player.playing = true;
  const entered = deferred();
  const release = deferred();
  node.rest.updatePlayer = async (_guild, payload) => { entered.resolve(); await release.promise; return payload; };
  const stopping = player.stop();
  await entered.promise;
  let exported = false;
  const exporting = player.exportSnapshot().then(value => { exported = true; return value; });
  await Promise.resolve();
  assert.equal(exported, false);
  release.resolve();
  await stopping;
  const saved = await exporting;
  assert.equal(saved.data.current, null);
  assert.equal(saved.data.playing, false);
});

test('live export deep-copies public track metadata and excludes voice and wire identities', async t => {
  const { player, node, requests } = createPlayer(t);
  node.backend = BackendDetector.detect({ version: { semver: '4.2.2' } });
  player.voice.connect = async () => {};
  const current = createTrack('live');
  current.backend = 'lavalink';
  current.userData = { custom: { nested: true } };
  current.requester = { id: 'requester', tags: ['retained'] };
  current.pluginInfo = { source: { content: 'retained' } };
  assert.equal(await player.play({ track: current, position: 45000 }), true);
  const saved = await player.exportSnapshot();
  const json = JSON.stringify(saved);
  assert.equal(saved.data.current.info.position, 45000);
  assert.deepEqual(saved.data.current.requester, current.requester);
  assert.equal(saved.data.current.backend, 'lavalink');
  assert.equal(json.includes('test-voice-token'), false);
  assert.equal(json.includes('__nyxlinkPlaybackAttempt'), false);
  assert.ok(requests.some(request => request.payload.track?.userData?.__nyxlinkPlaybackAttempt));
  saved.data.current.userData.custom.nested = false;
  saved.data.current.requester.tags.push('new');
  saved.data.current.pluginInfo.source.content = 'changed';
  assert.equal(current.userData.custom.nested, true);
  assert.deepEqual(current.requester.tags, ['retained']);
  assert.equal(current.pluginInfo.source.content, 'retained');
});

test('invalid snapshots and omitted import expectations leave stored state untouched', async t => {
  const { db } = database(t);
  await db.set(key, snapshot().data);
  const before = await db.get(key);
  await assert.rejects(db.importPlayer({ ...snapshot(), schemaVersion: 100 }, before.revision));
  await assert.rejects(db.importPlayer(snapshot()));
  assert.deepEqual(await db.get(key), before);
});

test('a provider CAS rejection surfaces a conflict without replacing the current record', async t => {
  const { db, adapter } = database(t);
  await db.set(key, snapshot().data);
  const before = await db.exportPlayer(guild);
  adapter.compareAndSet = async () => false;
  const changed = structuredClone(before);
  changed.data.volume = 1;
  await assert.rejects(db.importPlayer(changed, before.revision), { code: 'SNAPSHOT_CONFLICT' });
  assert.equal((await db.exportPlayer(guild)).data.volume, before.data.volume);
  assert.equal((await db.exportPlayer(guild)).revision, before.revision);
});
