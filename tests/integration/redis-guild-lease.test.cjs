const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { RedisGuildLeaseCoordinator, RedisStorage } = require('../../dist');
const { connectRedis } = require('../helpers/redis-client.cjs');

const guild = '123456789012345678';
const secondGuild = '223456789012345679';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function setup(t, ttlMs = 30000) {
  const clientA = await connectRedis();
  const clientB = await connectRedis();
  const namespace = 'lease_' + randomBytes(8).toString('hex');
  const a = new RedisGuildLeaseCoordinator({ client: clientA, namespace, ttlMs });
  const b = new RedisGuildLeaseCoordinator({ client: clientB, namespace, ttlMs });
  t.after(async () => {
    await Promise.allSettled([a.close(), b.close()]);
    const helper = new RedisStorage({ client: clientA, namespace });
    await helper.init({});
    await helper.clear();
    await helper.shutdown();
    await Promise.all([clientA.close(), clientB.close()]);
  });
  return { a, b, namespace, clientA, clientB };
}

test('Redis permits one guild owner at a time and increases fencing tokens', async t => {
  const { a, b } = await setup(t);
  const first = await a.acquire(guild);
  assert.ok(first);
  assert.equal(first.guildId, guild);
  assert.ok(Number.isSafeInteger(first.fencingToken));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(await b.acquire(guild), null);
  assert.equal(await a.isCurrent(first), true);
  assert.equal(await a.renew(first), true);
  assert.equal(await a.release(first), true);
  const second = await b.acquire(guild);
  assert.ok(second);
  assert.ok(second.fencingToken > first.fencingToken);
  assert.equal(await a.release(first), false);
  assert.equal(await b.isCurrent(second), true);
});

test('expired owner cannot renew or release a replacement owner', async t => {
  const { a, b } = await setup(t, 1000);
  const first = await a.acquire(guild);
  assert.ok(first);
  await pause(1200);
  assert.equal(await a.isCurrent(first), false);
  const second = await b.acquire(guild);
  assert.ok(second);
  assert.ok(second.fencingToken > first.fencingToken);
  assert.equal(await a.renew(first), false);
  assert.equal(await a.release(first), false);
  assert.equal(await b.isCurrent(second), true);
  assert.equal(await b.renew(second), true);
});

test('lease ownership is independent per guild and per bot namespace', async t => {
  const { a, b, clientA, namespace } = await setup(t);
  const first = await a.acquire(guild);
  const second = await b.acquire(secondGuild);
  assert.ok(first);
  assert.ok(second);
  const other = new RedisGuildLeaseCoordinator({
    client: clientA, namespace: namespace + '_other',
  });
  try {
    const independent = await other.acquire(guild);
    assert.ok(independent);
    assert.equal(await a.isCurrent(first), true);
    assert.equal(await b.isCurrent(second), true);
  } finally {
    // Close the extra owner before setup's after hook closes its Redis socket.
    await other.close();
  }
});

test('closing during an in-flight acquisition cannot strand a Redis lease', async t => {
  const { a, b } = await setup(t);
  const pending = a.acquire(guild);
  await a.close();
  const outcome = await pending;
  assert.equal(outcome, null);
  const other = await b.acquire(guild);
  assert.ok(other);
});

test('coordinator shutdown removes held locks but preserves Redis connection', async t => {
  const { a, b, clientA } = await setup(t);
  const first = await a.acquire(guild);
  const second = await a.acquire(secondGuild);
  assert.ok(first);
  assert.ok(second);
  await a.close();
  assert.equal(await clientA.sendCommand(['PING']), 'PONG');
  assert.ok(await b.acquire(guild));
  assert.ok(await b.acquire(secondGuild));
});
