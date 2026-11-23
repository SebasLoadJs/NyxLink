'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { RedisStorage } = require('../../dist');
const { connectRedis } = require('../helpers/redis-client.cjs');
const { ownedManager, GUILD } = require('../helpers/owned-manager.cjs');

async function pair(t, options = {}) {
  const aClient = await connectRedis();
  const bClient = await connectRedis();
  const namespace = 'player_' + randomBytes(8).toString('hex');
  const aStorage = new RedisStorage({ client: aClient, namespace });
  const bStorage = new RedisStorage({ client: bClient, namespace });
  const a = await ownedManager(aClient, namespace, { ...options, storage: aStorage });
  const b = await ownedManager(bClient, namespace, { ...options, storage: bStorage });
  t.after(async () => {
    await Promise.allSettled([a.manager.shutdown(), b.manager.shutdown()]);
    const cleaner = new RedisStorage({ client: aClient, namespace });
    await cleaner.init(a.manager);
    await cleaner.clear();
    await cleaner.shutdown();
    await Promise.all([aClient.close(), bClient.close()]);
  });
  return { a, b };
}

test('leased PlayerManager requires async createOwned and excludes competing Managers', async t => {
  const { a, b } = await pair(t);
  assert.throws(() => a.manager.players.create(a.options), /createOwned/);
  const player = await a.manager.players.createOwned(a.options);
  player.stopHealthCheck();
  assert.equal(a.manager.players.get(GUILD), player);
  assert.ok(a.manager.guildOwnership.localLease(GUILD).fencingToken > 0);
  await assert.rejects(b.manager.players.createOwned(b.options), /another process/);
  // The public Manager.send callback remains caller-owned. Player voice
  // operations are the guarded gateway surface.
  const { Player } = require('../../dist');
  const unowned = new Player(b.manager, b.node, b.options);
  unowned.stopHealthCheck();
  await assert.rejects(unowned.connect(), /lease/);
  await player.pause();
  assert.equal(a.activity.updates.length, 1);
  assert.equal(b.activity.updates.length, 0);
  await player.destroy('intentional relinquish');
  const replacement = await b.manager.players.createOwned(b.options);
  replacement.stopHealthCheck();
  assert.ok(b.manager.guildOwnership.localLease(GUILD).fencingToken > 0);
});

test('lost lease prevents REST, gateway and snapshot writes by the old Player', async t => {
  const { a, b } = await pair(t);
  const player = await a.manager.players.createOwned(a.options);
  player.stopHealthCheck();
  await a.manager.database.flush();
  const previous = a.manager.guildOwnership.localLease(GUILD);
  await a.coordinator.release(previous);
  const successor = await b.manager.players.createOwned(b.options);
  successor.stopHealthCheck();
  await b.manager.database.flush();
  const record = await b.manager.database.get('players.' + GUILD);
  assert.ok(record && record.revision);

  await assert.rejects(player.pause(), /lease/);
  assert.equal(a.activity.updates.length, 0);
  await assert.rejects(a.manager.database.set('players.' + GUILD + '.paused', true), /lease/);
  await assert.rejects(player.connect(), /lease/);
  await player.destroy('stale process cleanup');
  await a.manager.database.flush();
  const after = await b.manager.database.get('players.' + GUILD);
  assert.equal(after.revision, record.revision, 'a stale player must not erase or mutate successor snapshot');
  assert.equal(b.manager.players.get(GUILD), successor);
});

test('restoreOwned is gated by a Redis lease and plain restore stays synchronous for legacy users', async t => {
  const { a, b } = await pair(t);
  const restored = await a.manager.players.restoreOwned(a.options);
  restored.stopHealthCheck();
  assert.equal(restored.node, a.node);
  await assert.rejects(b.manager.players.restoreOwned(b.options), /another process/);
  assert.throws(() => b.manager.players.restore(b.options), /createOwned|restoreOwned/);
});

test('Manager shutdown frees owned guilds and stops the ownership heartbeat', async t => {
  const { a, b } = await pair(t);
  const first = await a.manager.players.createOwned(a.options);
  first.stopHealthCheck();
  const token = a.manager.guildOwnership.localLease(GUILD).fencingToken;
  await a.manager.shutdown();
  assert.equal(a.manager.guildOwnership.isClosed, true);
  const replacement = await b.manager.players.createOwned(b.options);
  replacement.stopHealthCheck();
  assert.ok(b.manager.guildOwnership.localLease(GUILD).fencingToken > token);
});

test('separate Node.js processes cannot both create the same guild player', async t => {
  const { fork } = require('node:child_process');
  const { once } = require('node:events');
  const path = require('node:path');
  const namespace = 'fork_' + randomBytes(8).toString('hex');
  const child = fork(path.join(__dirname, '../helpers/redis-player-worker.cjs'), [namespace], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  let client;
  let parent;
  t.after(async () => {
    try {
      if (parent) await parent.manager.shutdown();
      if (client) {
        const helper = new RedisStorage({ client, namespace });
        await helper.init({});
        await helper.clear();
        await helper.shutdown();
      }
    } finally {
      if (client) await client.close();
      if (child.exitCode === null) child.kill();
    }
  });
  const [message] = await once(child, 'message', { signal: AbortSignal.timeout(12000) });
  assert.equal(message.event, 'acquired', stderr || JSON.stringify(message));
  const childToken = message.fencingToken;

  client = await connectRedis();
  parent = await ownedManager(client, namespace);
  await assert.rejects(parent.manager.players.createOwned(parent.options), /another process/);
  const { Player } = require('../../dist');
  const unowned = new Player(parent.manager, parent.node, parent.options);
  unowned.stopHealthCheck();
  await assert.rejects(unowned.connect(), /lease/);

  child.send({ event: 'release' });
  const [released] = await once(child, 'message', { signal: AbortSignal.timeout(12000) });
  assert.equal(released.event, 'released', stderr || JSON.stringify(released));
  const replacement = await parent.manager.players.createOwned(parent.options);
  replacement.stopHealthCheck();
  assert.ok(parent.manager.guildOwnership.localLease(GUILD).fencingToken > childToken);
  await replacement.pause();
  assert.equal(parent.activity.updates.length, 1);
});
