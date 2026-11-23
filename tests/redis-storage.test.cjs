const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager, RedisStorage } = require('../dist');

const client = { sendCommand: async () => 'PONG' };
const config = () => ({
  nodes: [{ host: '127.0.0.1', port: 2333, password: 'fixture' }],
  options: { database: { type: 'external' } },
});

test('Redis storage is opt-in and requires a supplied adapter', () => {
  assert.throws(() => new Manager(config()).database, /initialized/);
  const manager = new Manager(config());
  const { DatabaseManager } = require('../dist/src/managers/DatabaseManager.js');
  assert.throws(() => new DatabaseManager(manager), /adapter/);
});

test('Redis adapter rejects invalid namespaces, missing command transports and unsafe paths', async () => {
  for (const options of [
    {}, { client }, { client, namespace: '../other' },
    { client, namespace: '' }, { client, namespace: 'with:colon' },
  ]) {
    assert.throws(() => new RedisStorage(options), TypeError);
  }
  const storage = new RedisStorage({ client, namespace: 'safe_1' });
  await storage.init({});
  for (const key of [
    'players.__proto__.volume', 'nodes.constructor', 'players.guild..volume',
    'players.guild.password space', '', '.nodes',
  ]) {
    await assert.rejects(storage.get(key), TypeError);
  }
  await assert.rejects(storage.compareAndSet('players.guild.volume', null, {}), /root/);
  await assert.rejects(storage.compareAndSet('players.guild', '', {}), /revision/);
  await storage.shutdown();
  await assert.rejects(storage.get('players.guild'), /unavailable/);
});
