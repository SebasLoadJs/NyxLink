const test = require('node:test');
const assert = require('node:assert/strict');
const { RedisStorage } = require('../dist/src/database/RedisStorage');
const { RedisGuildLeaseCoordinator } = require('../dist/src/database/RedisGuildLeaseCoordinator');
const { registerRedisOwnership, compareAndSetOwnedPlayer } = require('../dist/src/database/RedisPlayerFence');

const guild = '123456789012345678';
const path = 'players.' + guild;
function fixture() {
  let live, revision = null, stored, calls = [];
  const client = { async sendCommand(args) {
    if (args[0] === 'PING') return 'PONG';
    if (args[1].includes("redis.call('INCR'")) {
      live = args[5] + ':1';
      return 1;
    }
    if (args[2] === '2' && args[1].includes('ARGV[4]')) {
      calls.push(args);
      assert.ok(args[1].indexOf('KEYS[2]') < args[1].indexOf("redis.call('SET'"));
      if (live !== args[8]) return -1;
      if ((revision ?? '') !== args[5]) return 0;
      stored = args[6] === 'delete' ? undefined : JSON.parse(args[7]);
      revision = stored?.revision ?? null;
      return 1;
    }
    if (args[1].includes("redis.call('DEL'")) { live = undefined; return 1; }
    throw Error('unexpected Redis command');
  } };
  return { client, calls, get stored() { return stored; }, expire() { live = 'other-owner:2'; } };
}

test('Redis snapshot CAS verifies the original lease in the atomic command', async () => {
  const f = fixture();
  const storage = new RedisStorage({ client: f.client, namespace: 'test' });
  const coordinator = new RedisGuildLeaseCoordinator({ client: f.client, namespace: 'test' });
  const owner = {};
  registerRedisOwnership(owner, coordinator);
  await storage.init({});
  const lease = await coordinator.acquire(guild);
  try {
    assert.equal(await compareAndSetOwnedPlayer(storage, owner, lease, path, null, { revision: 'r1' }), true);
    assert.equal(await compareAndSetOwnedPlayer(storage, owner, lease, path, null, { revision: 'r2' }), false);
    f.expire();
    await assert.rejects(compareAndSetOwnedPlayer(storage, owner, lease, path, 'r1', undefined), { code: 'SNAPSHOT_CONFLICT' });
    assert.deepEqual(f.stored, { revision: 'r1' });
    assert.equal(f.calls.length, 3);
  } finally { await coordinator.close(); }
});

test('Redis fencing refuses mismatched namespaces and missing ownership registrations', async () => {
  const f = fixture();
  const storage = new RedisStorage({ client: f.client, namespace: 'other' });
  const coordinator = new RedisGuildLeaseCoordinator({ client: f.client, namespace: 'test' });
  const owner = {};
  registerRedisOwnership(owner, coordinator);
  const lease = await coordinator.acquire(guild);
  try {
    await assert.rejects(compareAndSetOwnedPlayer(storage, owner, lease, path, null, {}), { code: 'SNAPSHOT_CONFLICT' });
    await assert.rejects(compareAndSetOwnedPlayer(storage, {}, lease, path, null, {}), { code: 'SNAPSHOT_CONFLICT' });
    assert.equal(f.calls.length, 0);
  } finally { await coordinator.close(); }
});
