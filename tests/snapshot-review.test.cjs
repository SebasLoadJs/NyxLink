const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager, Memory, TrackCodec, PlayerSnapshotCodec } = require('../dist');
const { DatabaseManager } = require('../dist/src/managers/DatabaseManager');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

const guild = '123456789012345678';
const channel = '223456789012345678';
const key = `players.${guild}`;
function snapshot() {
  const current = createTrack('review');
  current.userData = { custom: { retained: true } };
  return { schemaVersion: 1, revision: null, data: {
    guildId: guild, voiceChannelId: channel, current: TrackCodec.serialize(current),
    queue: [], previous: [], volume: 62, playing: false, paused: true,
    autoPlay: false, autoLeave: false, loop: 'off',
  } };
}
function database(t) {
  const adapter = new Memory();
  const manager = new Manager({ nodes: [{ host: '127.0.0.1', port: 2333, password: 'test' }],
    options: { database: { type: 'memory', adapter } } });
  const db = manager.database = new DatabaseManager(manager);
  t.after(() => db.shutdown());
  return { manager, db, adapter };
}

test('the snapshot returned by import cannot mutate its persisted metadata or revision', async t => {
  const { db } = database(t);
  const imported = await db.importPlayer(snapshot(), null);
  const revision = imported.revision;
  imported.data.current.userData.custom.retained = false;
  imported.data.volume = 999;
  const stored = await db.exportPlayer(guild);
  assert.equal(stored.revision, revision);
  assert.equal(stored.data.volume, 62);
  assert.equal(stored.data.current.userData.custom.retained, true);
});

test('reading the whole players collection cannot mutate a record without a revision change', async t => {
  const { db } = database(t);
  await db.set(key, snapshot().data);
  const before = await db.exportPlayer(guild);
  const players = await db.get('players');
  players[guild].volume = 999;
  players[guild].current.userData.custom.retained = false;
  const stored = await db.exportPlayer(guild);
  assert.equal(stored.revision, before.revision);
  assert.equal(stored.data.volume, 62);
  assert.equal(stored.data.current.userData.custom.retained, true);
});

test('reading a nested player value cannot mutate stored metadata through an alias', async t => {
  const { db } = database(t);
  await db.set(key, snapshot().data);
  const before = await db.exportPlayer(guild);
  const metadata = await db.get(`${key}.current.userData`);
  metadata.custom.retained = false;
  const stored = await db.exportPlayer(guild);
  assert.equal(stored.revision, before.revision);
  assert.equal(stored.data.current.userData.custom.retained, true);
});

test('a queued player write captures input before the caller mutates it', async t => {
  const { db, adapter } = database(t);
  const entered = deferred();
  const release = deferred();
  const set = adapter.set.bind(adapter);
  adapter.set = async (entry, value) => {
    if (entry === 'blocker') { entered.resolve(); await release.promise; }
    return set(entry, value);
  };
  const blocker = db.set('blocker', true);
  await entered.promise;
  const input = snapshot().data;
  const writing = db.set(key, input);
  input.volume = 999;
  input.current.userData.custom.retained = false;
  release.resolve();
  await Promise.all([blocker, writing]);
  const stored = await db.exportPlayer(guild);
  assert.equal(stored.data.volume, 62);
  assert.equal(stored.data.current.userData.custom.retained, true);
});

test('an import captures its input before pending earlier storage writes complete', async t => {
  const { db, adapter } = database(t);
  const entered = deferred();
  const release = deferred();
  const set = adapter.set.bind(adapter);
  adapter.set = async (entry, value) => {
    if (entry === 'blocker') { entered.resolve(); await release.promise; }
    return set(entry, value);
  };
  const blocker = db.set('blocker', true);
  await entered.promise;
  const input = snapshot();
  const importing = db.importPlayer(input, null);
  input.data.volume = 999;
  input.data.current.userData.custom.retained = false;
  release.resolve();
  await Promise.all([blocker, importing]);
  const stored = await db.exportPlayer(guild);
  assert.equal(stored.data.volume, 62);
  assert.equal(stored.data.current.userData.custom.retained, true);
});

test('removing a player field advances revision and invalidates an older import expectation', async t => {
  const { db } = database(t);
  const input = snapshot().data;
  input.textChannelId = '323456789012345678';
  await db.set(key, input);
  const before = await db.exportPlayer(guild);
  assert.equal(await db.remove(`${key}.textChannelId`), true);
  const after = await db.exportPlayer(guild);
  assert.notEqual(after.revision, before.revision);
  assert.equal(after.data.textChannelId, undefined);
  await assert.rejects(db.importPlayer(before, before.revision), { code: 'SNAPSHOT_CONFLICT' });
  assert.equal((await db.exportPlayer(guild)).revision, after.revision);
});

test('setting an entire player record to undefined removes it rather than leaving a revision-only record', async t => {
  const { db } = database(t);
  await db.set(key, snapshot().data);
  await db.set(key, undefined);
  assert.equal(await db.has(key), false);
  assert.equal(await db.exportPlayer(guild), undefined);
});

test('future stored player schema is protected from field updates, deletion and import', async t => {
  const { db, adapter } = database(t);
  const future = { ...snapshot().data, schemaVersion: 100, revision: 'future-format-revision' };
  await adapter.set(key, future);
  await assert.rejects(db.set(`${key}.volume`, 77));
  await assert.rejects(db.remove(key));
  await assert.rejects(db.importPlayer(snapshot(), future.revision));
  assert.deepEqual(await adapter.get(key), future);
});

test('synchronous player creation is blocked while a stored snapshot import is committing', async t => {
  const { manager, node, player: old } = createPlayer(t);
  manager.players.players.delete(guild);
  const entered = deferred();
  const release = deferred();
  const adapter = manager.database.provider;
  const compareAndSet = adapter.compareAndSet.bind(adapter);
  adapter.compareAndSet = async (...args) => {
    if (args[0] === key) { entered.resolve(); await release.promise; }
    return compareAndSet(...args);
  };
  const importing = manager.database.importPlayer(snapshot(), null);
  await entered.promise;
  try {
    assert.throws(() => manager.players.create({ guildId: guild, voiceChannelId: channel, node: node.identifier }), { code: 'SNAPSHOT_CONFLICT' });
    assert.equal(manager.players.has(guild), false);
  } finally { release.resolve(); }
  await importing;
  adapter.compareAndSet = compareAndSet;
  const created = manager.players.create({ guildId: guild, voiceChannelId: channel, node: node.identifier });
  created.stopHealthCheck();
  t.after(() => created.stopHealthCheck());
  assert.notEqual(created, old);
  assert.equal(manager.players.get(guild), created);
});

test('export rejects a stored record whose guild identity differs from its storage key', async t => {
  const { db, adapter } = database(t);
  const corrupt = { ...snapshot().data, guildId: '323456789012345678' };
  await adapter.set(key, corrupt);
  await assert.rejects(db.exportPlayer(guild));
  assert.deepEqual(await adapter.get(key), corrupt);
});

test('JSON normalization cannot turn validated filter state into a scalar snapshot value', () => {
  const input = snapshot();
  input.data.filters = new Date('2026-01-01T00:00:00.000Z');
  assert.throws(() => PlayerSnapshotCodec.parse(input));
});

test('JSON normalization cannot turn validated track plugin metadata into a scalar snapshot value', () => {
  const input = snapshot();
  input.data.current.pluginInfo = new Date('2026-01-01T00:00:00.000Z');
  assert.throws(() => PlayerSnapshotCodec.parse(input));
});
