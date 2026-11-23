const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Manager, RedisStorage, SnapshotConflictError } = require('../../dist');
const { DatabaseManager } = require('../../dist/src/managers/DatabaseManager.js');
const { connectRedis } = require('../helpers/redis-client.cjs');

const GUILD = '123456789012345678';
const ROOT = 'players.' + GUILD;
const VOICE = '223456789012345678';

async function setup(t) {
  const client = await connectRedis('127.0.0.1', Number(process.env.NYXLINK_REDIS_TEST_PORT || 6379));
  const namespace = 'ci_' + randomBytes(8).toString('hex');
  const create = async (name = namespace) => {
    const adapter = new RedisStorage({ client, namespace: name });
    const manager = new Manager({
      nodes: [{ identifier: 'node-a', host: '127.0.0.1', port: 2333, password: 'test-only' }],
      options: { database: { type: 'external', adapter } },
    });
    const db = new DatabaseManager(manager);
    manager.database = db;
    await db.initialize();
    return { manager, db, adapter };
  };
  const a = await create();
  const b = await create();
  t.after(async () => {
    await Promise.allSettled([a.db.shutdown(), b.db.shutdown()]);
    const clean = new RedisStorage({ client, namespace });
    await clean.init(a.manager);
    await clean.clear();
    await clean.shutdown();
    const other = new RedisStorage({ client, namespace: namespace + '_other' });
    await other.init(a.manager);
    await other.clear();
    await other.shutdown();
    await client.close();
  });
  return { a, b, client, create, namespace };
}

test('Redis uses atomic nested writes across processes without losing sibling fields', async t => {
  const { a, b } = await setup(t);
  await a.db.set('nodes.worker01.sessions.first', { sessionId: 'one' });
  await b.db.set('nodes.worker01.sessions.second', { sessionId: 'two' });
  await Promise.all([
    a.db.set('nodes.worker01.flags.healthy', false),
    b.db.set('nodes.worker01.flags.load', 0),
  ]);
  assert.deepEqual(await b.db.get('nodes.worker01'), {
    sessions: { first: { sessionId: 'one' }, second: { sessionId: 'two' } },
    flags: { healthy: false, load: 0 },
  });
  assert.equal(await a.db.get('nodes.worker01.flags.healthy'), false);
  assert.equal(await a.db.remove('nodes.worker01.sessions.first'), true);
  assert.equal(await b.db.remove('nodes.worker01.sessions.first'), false);
  assert.deepEqual(await a.db.get('nodes.worker01.sessions.second'), { sessionId: 'two' });
  assert.ok((await a.db.keys('nodes.worker01.*')).includes('nodes.worker01.flags.healthy'));
});

test('Redis root CAS prevents two external writers replacing the same player revision', async t => {
  const { a, b } = await setup(t);
  await a.db.set(ROOT, { guildId: GUILD, voiceChannelId: VOICE, volume: 20 });
  const before = await a.db.get(ROOT);
  assert.equal(typeof before.revision, 'string');
  const results = await Promise.all([
    a.adapter.compareAndSet(ROOT, before.revision, { ...before, volume: 30, revision: 'writer-one' }),
    b.adapter.compareAndSet(ROOT, before.revision, { ...before, volume: 40, revision: 'writer-two' }),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  const latest = await b.db.get(ROOT);
  assert.equal(latest.revision, results[0] ? 'writer-one' : 'writer-two');
  assert.equal(latest.volume, results[0] ? 30 : 40);
  assert.equal(await a.adapter.compareAndSet(ROOT, before.revision, before), false);
});

test('DatabaseManager field CAS retries safely across two Redis-backed Managers', async t => {
  const { a, b } = await setup(t);
  await a.db.set(ROOT, { guildId: GUILD, voiceChannelId: VOICE, volume: 10 });
  await Promise.all([
    a.db.set(ROOT + '.volume', 77),
    b.db.set(ROOT + '.paused', true),
    a.db.set(ROOT + '.loop', 'queue'),
    b.db.set(ROOT + '.autoPlay', false),
  ]);
  const record = await a.db.get(ROOT);
  assert.equal(record.volume, 77);
  assert.equal(record.paused, true);
  assert.equal(record.loop, 'queue');
  assert.equal(record.autoPlay, false);
  assert.equal(typeof record.revision, 'string');
  const all = await b.db.get('players');
  assert.equal(all[GUILD].volume, 77);
  assert.ok((await b.db.keys('players.*')).includes(ROOT + '.revision'));
});

test('snapshot import is exclusive across Redis-backed processes', async t => {
  const { a, b } = await setup(t);
  const input = {
    schemaVersion: 1,
    revision: null,
    data: {
      guildId: GUILD, voiceChannelId: VOICE, node: 'node-a',
      current: null, queue: [], previous: [], volume: 50,
      playing: false, paused: false, autoPlay: false, autoLeave: false, loop: 'off',
    },
  };
  const outcomes = await Promise.allSettled([
    a.db.importPlayer(input, null),
    b.db.importPlayer(input, null),
  ]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  const failed = outcomes.find(item => item.status === 'rejected');
  assert.ok(failed);
  assert.ok(failed.reason instanceof SnapshotConflictError);
  assert.equal((await b.db.get(ROOT)).guildId, GUILD);
});

test('namespace clear preserves other bots, and shutdown does not close caller Redis client', async t => {
  const { a, b, client, create, namespace } = await setup(t);
  const outside = await create(namespace + '_other');
  await a.db.set('nodes.a1.token', 'only-one');
  await outside.db.set('nodes.a1.token', 'only-other');
  await a.db.clear();
  assert.equal(await b.db.get('nodes.a1.token'), undefined);
  assert.equal(await outside.db.get('nodes.a1.token'), 'only-other');
  await a.db.shutdown();
  assert.equal(await client.sendCommand(['PING']), 'PONG');
  await outside.db.shutdown();
});
