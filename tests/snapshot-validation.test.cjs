const test = require('node:test');
const assert = require('node:assert/strict');
const { PlayerSnapshotCodec, TrackCodec } = require('../dist');
const { createPlayer, createTrack } = require('./helpers/player.cjs');
const guild = '123456789012345678';
const channel = '223456789012345678';
const snapshot = () => ({ schemaVersion: 1, revision: null, data: { guildId: guild, voiceChannelId: channel } });

test('explicit malformed revisions and nullable configuration are rejected', () => {
  for (const revision of [undefined, {}, [], 0]) assert.throws(() => PlayerSnapshotCodec.parse({ ...snapshot(), revision }), { code: 'INVALID_SNAPSHOT' });
  for (const field of ['volume', 'loop']) {
    const value = snapshot();
    value.data[field] = null;
    assert.throws(() => PlayerSnapshotCodec.parse(value), { code: 'INVALID_SNAPSHOT' });
  }
});

test('sparse queues cannot turn into unvalidated null track entries', () => {
  const value = snapshot();
  value.data.queue = new Array(1);
  assert.throws(() => PlayerSnapshotCodec.parse(value), { code: 'INVALID_SNAPSHOT' });
});

test('invalid raw positions and negative fractional durations are not normalized into valid metadata', () => {
  for (const field of ['position', 'length']) {
    const value = snapshot();
    value.data.current = TrackCodec.serialize(createTrack('invalid'));
    value.data.current.info[field] = field === 'position' ? NaN : -0.5;
    assert.throws(() => PlayerSnapshotCodec.parse(value), { code: 'INVALID_SNAPSHOT' });
  }
});

test('a future stored schema cannot be adopted when a server session resumes', async t => {
  const { manager, node, player } = createPlayer(t);
  manager.players.players.delete(guild);
  const future = { guildId: guild, voiceChannelId: channel, schemaVersion: 100, revision: 'future', node: node.identifier };
  await manager.database.provider.set(`players.${guild}`, future);
  node.rest.getPlayers = async () => [{ guildId: guild, track: null, volume: 50, paused: true, state: { position: 0 } }];
  const errors = [];
  manager.on('nodeError', (_node, error) => errors.push(error));
  const detach = manager.on('playerCreate', restored => { restored.stopHealthCheck(); restored.voice.connect = async () => {}; });
  try { await node._resumePlayers(); } finally { detach(); }
  assert.equal(manager.players.has(guild), false);
  assert.ok(errors.some(error => error.code === 'INVALID_SNAPSHOT'));
  assert.deepEqual(await manager.database.provider.get(`players.${guild}`), future);
  player.stopHealthCheck();
});

test('copied player metadata preserves an own __proto__ key without changing object prototypes', async t => {
  const { manager, player } = createPlayer(t);
  const key = `players.${guild}.custom`;
  const metadata = JSON.parse('{"__proto__":{"snapshotPolluted":true},"nested":{"retained":true}}');
  await manager.database.set(key, metadata);
  metadata.nested.retained = false;
  const saved = await manager.database.get(key);
  assert.equal(Object.getPrototypeOf(saved), Object.prototype);
  assert.equal(Object.hasOwn(saved, '__proto__'), true);
  assert.equal(saved.__proto__.snapshotPolluted, true);
  assert.equal({}.snapshotPolluted, undefined);
  assert.equal(saved.nested.retained, true);
  player.stopHealthCheck();
});

test('circular write metadata rejects without changing the last acknowledged revision', async t => {
  const { manager, player } = createPlayer(t);
  const key = `players.${guild}`;
  await manager.database.set(`${key}.volume`, 42);
  const before = await manager.database.get(key);
  const circular = {};
  circular.self = circular;
  await assert.rejects(manager.database.set(`${key}.custom`, circular), { code: 'INVALID_SNAPSHOT' });
  assert.deepEqual(await manager.database.get(key), before);
  player.stopHealthCheck();
});

test('independent managers rebase concurrent field writes on the latest atomic record', async t => {
  const { manager, player } = createPlayer(t);
  const { DatabaseManager } = require('../dist/src/managers/DatabaseManager');
  const { Manager } = require('../dist');
  const peer = new Manager({ nodes: [{ host: '127.0.0.1', port: 2333, password: 'fixture' }], options: { database: { type: 'memory', adapter: manager.database.provider } } });
  peer.database = new DatabaseManager(peer);
  const key = `players.${guild}`;
  await manager.database.set(`${key}.guildId`, guild);
  await Promise.all([
    manager.database.set(`${key}.volume`, 73),
    peer.database.set(`${key}.paused`, true),
  ]);
  assert.equal(await manager.database.get(`${key}.volume`), 73);
  assert.equal(await peer.database.get(`${key}.paused`), true);
  assert.equal(await peer.database.get(`${key}.guildId`), guild);
  player.stopHealthCheck();
});

test('ordinary writes stop after their finite CAS conflict budget and later writes remain usable', async t => {
  const { manager, player } = createPlayer(t);
  const key = `players.${guild}`;
  await manager.database.set(`${key}.volume`, 73);
  const before = await manager.database.get(key);
  const adapter = manager.database.provider;
  const cas = adapter.compareAndSet.bind(adapter);
  let attempts = 0;
  adapter.compareAndSet = async () => { attempts++; return false; };
  await assert.rejects(manager.database.set(`${key}.volume`, 99), { code: 'SNAPSHOT_CONFLICT' });
  assert.equal(attempts, 8);
  assert.deepEqual(await manager.database.get(key), before);
  adapter.compareAndSet = cas;
  await manager.database.set(`${key}.volume`, 74);
  assert.equal(await manager.database.get(`${key}.volume`), 74);
  player.stopHealthCheck();
});

test('track origin and optional artwork identifiers cannot violate the snapshot type contract', () => {
  for (const field of ['artworkUrl', 'isrc']) {
    const value = snapshot();
    value.data.current = TrackCodec.serialize(createTrack('metadata-types'));
    value.data.current.info[field] = 42;
    assert.throws(() => PlayerSnapshotCodec.parse(value), { code: 'INVALID_SNAPSHOT' });
  }
  const value = snapshot();
  value.data.current = TrackCodec.serialize(createTrack('metadata-types'));
  value.data.current.origin = 42;
  assert.throws(() => PlayerSnapshotCodec.parse(value), { code: 'INVALID_SNAPSHOT' });
});
