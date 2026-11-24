const test = require('node:test');
const assert = require('node:assert/strict');
const { Logger, Node, NodeState } = require('../dist');
const { createPlayer } = require('./helpers/player.cjs');

function migration(t) {
  const fixture = createPlayer(t);
  const records = [];
  const logger = new Logger({ level: 'debug', timelineLimit: 100, transports: [{ write(record) { records.push(record); } }] });
  fixture.manager.logger = logger;
  const target = new Node(fixture.manager, { identifier: 'observed-target', host: '127.0.0.1', port: 2444, password: 'fixture' });
  target.connected = true; target.state = NodeState.READY;
  fixture.manager.nodes.nodes.set(target.identifier, target);
  fixture.node.rest.destroyPlayer = async () => {};
  target.rest.destroyPlayer = async () => {};
  t.after(async () => { await target.destroy(); await logger.close(); });
  return { ...fixture, logger, records, target };
}

test('successful migration reports only actual acknowledged stages with a common migration ID', async t => {
  const { player, target, logger, records } = migration(t);
  player.restart = async () => true;
  assert.equal(await player.transferNode(target), true);
  await logger.flush();
  const observations = records.filter(record => record.event.startsWith('migration.'));
  const acknowledged = observations.filter(record => record.context.status === 'acknowledged');
  assert.deepEqual(acknowledged.map(record => record.context.stage), ['select-target', 'resolve-track', 'restore-player', 'persist-snapshot', 'cleanup-source']);
  assert.equal(new Set(observations.map(record => record.context.migrationId)).size, 1);
  assert.ok(observations.every(record => record.context.elapsedMs >= 0 && record.context.guildId === player.guildId));
});

test('failed destination restoration records rollback without claiming persisted destination state', async t => {
  const { player, target, logger, records } = migration(t);
  player.restart = async () => false;
  assert.equal(await player.transferNode(target), false);
  await logger.flush();
  assert.ok(records.some(record => record.context.stage === 'restore-player' && record.context.status === 'failed'));
  assert.ok(records.some(record => record.context.stage === 'rollback' && record.context.status === 'acknowledged'));
  assert.ok(!records.some(record => record.context.stage === 'persist-snapshot' && record.context.status === 'acknowledged'));
  assert.ok(!records.some(record => record.context.stage === 'cleanup-source'));
});

test('source cleanup failure remains visible after confirmed destination commit', async t => {
  const { node, player, target, logger, records } = migration(t);
  player.restart = async () => true;
  node.rest.destroyPlayer = async () => { throw new Error('password=PRIVATE_CLEANUP'); };
  assert.equal(await player.transferNode(target), true);
  await logger.flush();
  assert.equal(player.node, target);
  assert.ok(records.some(record => record.context.stage === 'cleanup-source' && record.context.status === 'failed'));
  assert.ok(!records.some(record => record.context.stage === 'cleanup-source' && record.context.status === 'acknowledged'));
  assert.ok(!JSON.stringify(records).includes('PRIVATE_CLEANUP'));
});

test('rollback storage failures are reported as partial rather than confirmed restoration', async t => {
  const { player, target, logger, records } = migration(t);
  const original = player.updateData;
  player.restart = async () => false;
  player.updateData = async () => { throw new Error('storage unavailable'); };
  try { assert.equal(await player.transferNode(target), false); }
  finally { player.updateData = original; }
  await logger.flush();
  assert.ok(records.some(record => record.context.stage === 'rollback' && record.context.status === 'partial'));
  assert.ok(!records.some(record => record.context.stage === 'rollback' && record.context.status === 'acknowledged'));
});
