const test = require('node:test');
const assert = require('node:assert/strict');
const { RedisGuildLeaseCoordinator } = require('../dist');

const client = { sendCommand: async () => 0 };
const guild = '123456789012345678';

test('opt-in lease coordinator validates namespace, TTL, client and Discord guild', async () => {
  for (const options of [
    {}, { client }, { client, namespace: 'oops/unsafe' },
    { client, namespace: 'safe', ttlMs: 0 },
    { client, namespace: 'safe', ttlMs: 100 },
    { client, namespace: 'safe', ttlMs: 300001 },
  ]) assert.throws(() => new RedisGuildLeaseCoordinator(options), TypeError);
  const coordinator = new RedisGuildLeaseCoordinator({ client, namespace: 'valid_ns' });
  assert.throws(() => coordinator.acquire('not-a-guild'), TypeError);
  assert.equal(await coordinator.acquire(guild), null);
  await coordinator.close();
  await assert.rejects(coordinator.acquire(guild), /closed/);
});

test('a coordinator cannot be attached to two Managers at once', async t => {
  const { Manager, RedisGuildLeaseCoordinator } = require('../dist');
  const options = {
    nodes: [{ host: '127.0.0.1', port: 2333, password: 'test' }],
  };
  const first = new Manager(options);
  const second = new Manager(options);
  const coordinator = new RedisGuildLeaseCoordinator({
    client, namespace: 'exclusive_coordinator',
  });
  t.after(async () => Promise.allSettled([first.shutdown(), second.shutdown()]));
  first.useGuildLeases({ coordinator });
  assert.throws(() => second.useGuildLeases({ coordinator }), /only one Manager/);
  assert.throws(() => first.useGuildLeases({ coordinator }), /before creating|once/);
});
