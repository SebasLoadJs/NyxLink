'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { RedisGuildIpcRouter } = require('../dist');

const GUILD = '123456789012345678';
const VOICE = '223456789012345678';
const validEnvelope = () => ({
  protocol: 'nyxlink/guild-voice/2',
  guildId: GUILD,
  fencingToken: 12,
  sequence: 1,
  commandId: randomUUID(),
  packet: {
    op: 4,
    d: { guild_id: GUILD, channel_id: VOICE, self_deaf: false, self_mute: true },
  },
});

test('IPC router is explicit and rejects invalid Redis transport or namespace', () => {
  const client = { sendCommand: async () => 0 };
  for (const options of [
    {}, { namespace: 'valid' }, { client },
    { client, namespace: '../unsafe' },
    { client, namespace: 'ok', dedupeTtlMs: 0 },
    { client, namespace: 'ok', dedupeTtlMs: 300001 },
    { client, namespace: 'ok', dedupeTtlMs: Number.NaN },
  ]) {
    assert.throws(() => new RedisGuildIpcRouter(options), TypeError);
  }
  assert.ok(new RedisGuildIpcRouter({ client, namespace: 'valid_name' }));
});

test('IPC rejects malformed input before contacting Redis or invoking a gateway', async () => {
  let backendCalls = 0;
  let gatewayCalls = 0;
  const router = new RedisGuildIpcRouter({
    client: { sendCommand: async () => { backendCalls++; return 1; } },
    namespace: 'test',
  });
  const input = validEnvelope();
  for (const bad of [
    null, [], 'raw', {},
    { ...input, guildId: 'wrong' },
    { ...input, protocol: 'made-up' },
    { ...input, fencingToken: -1 },
    { ...input, fencingToken: Number.MAX_SAFE_INTEGER + 1 },
    { ...input, sequence: 0 },
    { ...input, sequence: 1.5 },
    { ...input, sequence: Number.MAX_SAFE_INTEGER + 1 },
    { ...input, sequence: undefined },
    { ...input, protocol: 'nyxlink/guild-voice/1' },
    { ...input, commandId: 'test' },
    { ...input, packet: { op: 4, d: { ...input.packet.d, channel_id: 'invalid' } } },
    { ...input, packet: { op: 4, d: { ...input.packet.d, self_deaf: 1 } } },
    { ...input, packet: { op: 5, d: input.packet.d } },
  ]) await assert.rejects(router.dispatch(bad, () => { gatewayCalls++; }), TypeError);
  assert.equal(backendCalls, 0);
  assert.equal(gatewayCalls, 0);
});

test('IPC router fails closed on Redis stale status and suppresses duplicates', async () => {
  let code = 0;
  let deliveries = 0;
  const router = new RedisGuildIpcRouter({
    client: { sendCommand: async args => {
      assert.equal(args[0], 'EVAL');
      assert.equal(args[2], '4');
      return code;
    } },
    namespace: 'safe',
  });
  const input = validEnvelope();
  assert.equal(await router.dispatch(input, () => { deliveries++; }), 'stale');
  code = 2;
  assert.equal(await router.dispatch(input, () => { deliveries++; }), 'duplicate');
  code = 1;
  assert.equal(await router.dispatch(input, () => { deliveries++; }), 'delivered');
  assert.equal(deliveries, 1);
  code = 3;
  await assert.rejects(router.dispatch(input, () => { deliveries++; }), /Invalid Redis/);
  assert.equal(deliveries, 1);
});

test('IPC sender must verify a live local lease before preparing an envelope', async () => {
  const router = new RedisGuildIpcRouter({
    client: { sendCommand: async () => 1 },
    namespace: 'test',
  });
  const ownership = {
    localLease: () => ({ guildId: GUILD, fencingToken: 17 }),
    assertCurrent: async () => { throw new Error('Guild lease expired'); },
  };
  await assert.rejects(router.prepare(ownership, GUILD, validEnvelope().packet), /expired/);
  ownership.assertCurrent = async () => {};
  await assert.rejects(router.prepare(ownership, GUILD, {
    op: 4,
    d: { ...validEnvelope().packet.d, guild_id: VOICE },
  }), TypeError);
  const prepared = await router.prepare(ownership, GUILD, validEnvelope().packet);
  assert.equal(prepared.guildId, GUILD);
  assert.equal(prepared.fencingToken, 17);
  assert.equal(prepared.sequence, 1);
  assert.equal(prepared.protocol, 'nyxlink/guild-voice/2');
  assert.equal(prepared.packet.op, 4);
});

test('preparation refuses a lease handoff between initial check and Redis sequencing', async () => {
  const router = new RedisGuildIpcRouter({
    client: { sendCommand: async () => 0 },
    namespace: 'race',
  });
  const owner = {
    assertCurrent: async () => undefined,
    localLease: () => ({ guildId: GUILD, fencingToken: 19 }),
  };
  await assert.rejects(router.prepare(owner, GUILD, validEnvelope().packet), /lease changed/);
});

test('sequence allocation rejects unexpected Redis values and never creates an envelope', async () => {
  const owner = {
    assertCurrent: async () => undefined,
    localLease: () => ({ guildId: GUILD, fencingToken: 19 }),
  };
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, 'not a number']) {
    const router = new RedisGuildIpcRouter({
      client: { sendCommand: async () => value },
      namespace: 'bad_sequence',
    });
    await assert.rejects(router.prepare(owner, GUILD, validEnvelope().packet), /Invalid Redis/);
  }
});
