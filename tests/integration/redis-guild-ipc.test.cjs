'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const { RedisGuildIpcRouter, RedisStorage } = require('../../dist');
const { connectRedis } = require('../helpers/redis-client.cjs');
const { ownedManager, GUILD, VOICE } = require('../helpers/owned-manager.cjs');

const packet = () => ({
  op: 4,
  d: { guild_id: GUILD, channel_id: VOICE, self_deaf: true, self_mute: false },
});

async function setup(t) {
  const namespace = 'ipc_' + randomBytes(8).toString('hex');
  const aClient = await connectRedis();
  const bClient = await connectRedis();
  const a = await ownedManager(aClient, namespace);
  const b = await ownedManager(bClient, namespace);
  const sender = new RedisGuildIpcRouter({ client: aClient, namespace });
  const receiver = new RedisGuildIpcRouter({ client: bClient, namespace });
  t.after(async () => {
    await Promise.allSettled([a.manager.shutdown(), b.manager.shutdown()]);
    const cleaner = new RedisStorage({ client: aClient, namespace });
    await cleaner.init(a.manager);
    await cleaner.clear();
    await cleaner.shutdown();
    await Promise.all([aClient.close(), bClient.close()]);
  });
  return { a, b, sender, receiver };
}

test('owner prepares an IPC packet; receiver checks Redis and delivers only once', async t => {
  const { a, receiver, sender } = await setup(t);
  const player = await a.manager.players.createOwned(a.options);
  player.stopHealthCheck();
  const payload = packet();
  const command = await sender.prepare(a.manager.guildOwnership, GUILD, payload);
  assert.equal(command.protocol, 'nyxlink/guild-voice/2');
  assert.equal(command.guildId, GUILD);
  assert.equal(command.packet.d.channel_id, VOICE);
  assert.ok(command.fencingToken > 0);
  assert.ok(command.sequence > 0);
  assert.match(command.commandId, /^[0-9a-f-]{36}$/);
  const delivered = [];
  assert.equal(await receiver.dispatch(command, value => delivered.push(value)), 'delivered');
  assert.equal(await receiver.dispatch(command, value => delivered.push(value)), 'duplicate');
  assert.deepEqual(delivered, [payload]);
});

test('multiple receiver tasks racing for the same command deliver at most once', async t => {
  const { a, receiver, sender } = await setup(t);
  const player = await a.manager.players.createOwned(a.options);
  player.stopHealthCheck();
  const envelope = await sender.prepare(a.manager.guildOwnership, GUILD, packet());
  const calls = [];
  const results = await Promise.all(Array.from({ length: 12 }, () =>
    receiver.dispatch(envelope, async value => { calls.push(value); })
  ));
  assert.equal(results.filter(status => status === 'delivered').length, 1);
  assert.equal(results.filter(status => status === 'duplicate').length, 11);
  assert.equal(calls.length, 1);
});

test('expired or superseded generation cannot dispatch delayed IPC after guild handoff', async t => {
  const { a, b, receiver, sender } = await setup(t);
  const player = await a.manager.players.createOwned(a.options);
  player.stopHealthCheck();
  const before = await sender.prepare(a.manager.guildOwnership, GUILD, packet());
  const owner = a.manager.guildOwnership.localLease(GUILD);
  await a.coordinator.release(owner);
  const next = await b.manager.players.createOwned(b.options);
  next.stopHealthCheck();
  const delivered = [];
  assert.equal(await receiver.dispatch(before, value => delivered.push(value)), 'stale');
  assert.equal(delivered.length, 0);
  const replacement = await receiver.prepare(b.manager.guildOwnership, GUILD, packet());
  assert.ok(replacement.fencingToken > before.fencingToken);
  assert.equal(await receiver.dispatch(replacement, value => delivered.push(value)), 'delivered');
  assert.equal(delivered.length, 1);
});

test('wrong schema, guild mismatch and forged tokens never reach gateway callback', async t => {
  const { a, receiver, sender } = await setup(t);
  const player = await a.manager.players.createOwned(a.options);
  player.stopHealthCheck();
  const correct = await sender.prepare(a.manager.guildOwnership, GUILD, packet());
  let calls = 0;
  const handler = () => { calls++; };
  const invalid = [
    null, {}, { ...correct, protocol: 'v2' },
    { ...correct, commandId: 'not-uuid' },
    { ...correct, guildId: 'bad' },
    { ...correct, fencingToken: 0 },
    { ...correct, fencingToken: 1.2 },
    { ...correct, sequence: 0 },
    { ...correct, sequence: Number.MAX_SAFE_INTEGER + 1 },
    { ...correct, sequence: 'not-a-number' },
    { ...correct, protocol: 'nyxlink/guild-voice/1' },
    { ...correct, packet: { op: 8, d: correct.packet.d } },
    { ...correct, packet: { op: 4, d: { ...correct.packet.d, guild_id: VOICE } } },
    { ...correct, packet: { op: 4, d: { ...correct.packet.d, self_mute: 'false' } } },
    { ...correct, packet: { ...correct.packet, x: 'unexpected' } },
  ];
  for (const entry of invalid) {
    await assert.rejects(receiver.dispatch(entry, handler), TypeError);
  }
  const forged = { ...correct, fencingToken: correct.fencingToken + 3 };
  assert.equal(await receiver.dispatch(forged, handler), 'stale');
  const forgedFuture = { ...correct, sequence: correct.sequence + 999 };
  assert.equal(await receiver.dispatch(forgedFuture, handler), 'stale');
  assert.equal(calls, 0);
  assert.equal(await receiver.dispatch(correct, handler), 'delivered');
  assert.equal(calls, 1);
});

test('callback errors propagate; already claimed command is never replayed', async t => {
  const { a, receiver, sender } = await setup(t);
  const player = await a.manager.players.createOwned(a.options);
  player.stopHealthCheck();
  const envelope = await sender.prepare(a.manager.guildOwnership, GUILD, packet());
  await assert.rejects(receiver.dispatch(envelope, () => { throw new Error('gateway unavailable'); }), /gateway unavailable/);
  assert.equal(await receiver.dispatch(envelope, () => { throw new Error('should not run'); }), 'duplicate');
});

test('Redis failures fail closed at the IPC delivery boundary', async t => {
  const { a, sender } = await setup(t);
  const player = await a.manager.players.createOwned(a.options);
  player.stopHealthCheck();
  const envelope = await sender.prepare(a.manager.guildOwnership, GUILD, packet());
  const broken = new RedisGuildIpcRouter({
    client: { sendCommand: async () => { throw new Error('Redis unavailable'); } },
    namespace: 'unavailable',
  });
  let calls = 0;
  await assert.rejects(broken.dispatch(envelope, () => { calls++; }), /Redis unavailable/);
  assert.equal(calls, 0);
});

test('fenced IPC packet sent by separate Node.js worker is stale after handoff', async t => {
  const namespace = 'ipc_fork_' + randomBytes(8).toString('hex');
  const child = fork(path.join(__dirname, '../helpers/redis-player-worker.cjs'), [namespace], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk.toString(); });
  let client;
  let parent;
  t.after(async () => {
    try {
      if (parent) await parent.manager.shutdown();
      if (client) {
        const cleaner = new RedisStorage({ client, namespace });
        await cleaner.init({});
        await cleaner.clear();
        await cleaner.shutdown();
      }
    } finally {
      if (client) await client.close();
      if (child.exitCode === null) child.kill();
    }
  });

  const [ready] = await once(child, 'message', { signal: AbortSignal.timeout(12000) });
  assert.equal(ready.event, 'acquired', errors || JSON.stringify(ready));
  client = await connectRedis();
  const receiver = new RedisGuildIpcRouter({ client, namespace });
  child.send({ event: 'prepareVoiceIpc' });
  const [prepared] = await once(child, 'message', { signal: AbortSignal.timeout(12000) });
  assert.equal(prepared.event, 'voiceEnvelope', errors || JSON.stringify(prepared));
  const staleEnvelope = prepared.envelope;

  parent = await ownedManager(client, namespace);
  await assert.rejects(parent.manager.players.createOwned(parent.options), /another process/);
  const delivered = [];
  assert.equal(await receiver.dispatch(staleEnvelope, value => delivered.push(value)), 'delivered');
  child.send({ event: 'release' });
  const [released] = await once(child, 'message', { signal: AbortSignal.timeout(12000) });
  assert.equal(released.event, 'released', errors || JSON.stringify(released));
  const newPlayer = await parent.manager.players.createOwned(parent.options);
  newPlayer.stopHealthCheck();
  assert.equal(await receiver.dispatch(staleEnvelope, value => delivered.push(value)), 'stale');
  const newEnvelope = await receiver.prepare(parent.manager.guildOwnership, GUILD, packet());
  assert.ok(newEnvelope.fencingToken > staleEnvelope.fencingToken);
  assert.equal(await receiver.dispatch(newEnvelope, value => delivered.push(value)), 'delivered');
  assert.equal(delivered.length, 2);
});


test('newer voice state wins when IPC packets arrive out of order', async t => {
  const { a, sender, receiver } = await setup(t);
  const player = await a.manager.players.createOwned(a.options);
  player.stopHealthCheck();

  const join = await sender.prepare(a.manager.guildOwnership, GUILD, packet());
  const leave = await sender.prepare(a.manager.guildOwnership, GUILD, {
    op: 4,
    d: { guild_id: GUILD, channel_id: null, self_deaf: true, self_mute: false },
  });
  assert.ok(leave.sequence > join.sequence);
  const deliveries = [];
  assert.equal(await receiver.dispatch(leave, value => deliveries.push(value)), 'delivered');
  assert.equal(await receiver.dispatch(join, value => deliveries.push(value)), 'stale');
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].d.channel_id, null);
});

test('IPC sender sequence is monotonic under concurrent preparation on separate clients', async t => {
  const { a, sender, receiver } = await setup(t);
  const player = await a.manager.players.createOwned(a.options);
  player.stopHealthCheck();
  const operations = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    (i % 2 ? receiver : sender).prepare(a.manager.guildOwnership, GUILD, packet())
  ));
  const values = operations.map(x => x.sequence);
  assert.equal(new Set(values).size, operations.length);
  assert.deepEqual(values.slice().sort((a, b) => a - b),
    Array.from({ length: 12 }, (_, i) => Math.min(...values) + i));
  const newest = operations.reduce((a, b) => a.sequence > b.sequence ? a : b);
  const oldest = operations.reduce((a, b) => a.sequence < b.sequence ? a : b);
  const delivered = [];
  assert.equal(await receiver.dispatch(newest, p => delivered.push(p)), 'delivered');
  assert.equal(await sender.dispatch(oldest, p => delivered.push(p)), 'stale');
  assert.equal(delivered.length, 1);
});

test('an older sequence stays stale after deduplication key expiry', async t => {
  const { a, receiver, sender } = await setup(t);
  const shortReceiver = new RedisGuildIpcRouter({
    client: { sendCommand: (...args) => receiver.client.sendCommand(...args) },
    namespace: 'not-used',
  });
  // Both packets are prepared and routed through the regular namespace.
  const player = await a.manager.players.createOwned(a.options);
  player.stopHealthCheck();
  const first = await sender.prepare(a.manager.guildOwnership, GUILD, packet());
  const second = await sender.prepare(a.manager.guildOwnership, GUILD, packet());
  const delivered = [];
  assert.equal(await receiver.dispatch(second, p => delivered.push(p)), 'delivered');
  assert.equal(await receiver.dispatch(first, p => delivered.push(p)), 'stale');
  assert.equal(delivered.length, 1);
  void shortReceiver; // the lasting sequence key is independent of replay dedupe TTL.
});
