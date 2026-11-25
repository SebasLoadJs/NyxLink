const test = require('node:test');
const assert = require('node:assert/strict');
const { GuildOwnership } = require('../dist/src/cluster/GuildOwnership');
const { RedisGuildLeaseCoordinator } = require('../dist/src/database/RedisGuildLeaseCoordinator');

const guild = '123456789012345678';
const never = () => new Promise(() => {});
function fixture(t, overrides = {}) {
  const lease = { guildId: guild, fencingToken: 1 };
  const events = [];
  const coordinator = {
    durationMs: 1000,
    async acquire() { return lease; },
    async isCurrent() { return true; },
    async renew() { return true; },
    async release() {},
    async close() {},
    ...overrides,
  };
  const manager = { destroyed: false, players: { get() {} }, emit(...args) { events.push(args); } };
  const owner = new GuildOwnership(manager, { coordinator, renewIntervalMs: 50 });
  t.after(() => owner.close());
  return { owner, lease, events };
}

test('stalled Redis ownership check fails closed within the renewal interval', { timeout: 2000 }, async t => {
  const { owner, lease, events } = fixture(t, { isCurrent: never });
  assert.equal(await owner.acquire(guild), lease);
  assert.equal(await owner.isCurrent(guild), false);
  assert.equal(owner.localLease(guild), undefined);
  assert.throws(() => owner.assertLocal(guild), /not owned locally/);
  assert.equal(events.filter(e => e[0] === 'guildOwnershipLost').length, 1);
});

test('stalled heartbeat does not keep a guild locally owned', { timeout: 2000 }, async t => {
  const { owner, events } = fixture(t, { renew: never });
  await owner.acquire(guild);
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(owner.localLease(guild), undefined);
  assert.equal(events.filter(e => e[0] === 'guildOwnershipLost').length, 1);
});

test('a late successful Redis check cannot certify a released lease handle', async () => {
  let confirm;
  let entered;
  const checking = new Promise(resolve => { entered = resolve; });
  const client = { async sendCommand(args) {
    if (args[1].includes("redis.call('INCR'")) return 1;
    if (args[1].includes("redis.call('DEL'")) return 1;
    return new Promise(resolve => { confirm = resolve; entered(); });
  } };
  const coordinator = new RedisGuildLeaseCoordinator({ client, namespace: 'lease-test' });
  const lease = await coordinator.acquire(guild);
  const pending = coordinator.isCurrent(lease);
  await checking;
  await coordinator.release(lease);
  confirm(1);
  assert.equal(await pending, false);
  await coordinator.close();
});
