const test = require('node:test');
const assert = require('node:assert/strict');
const { AuroraEvents, Node, NodeState } = require('../dist');
const { createPlayer } = require('./helpers/player.cjs');

function migration(t) {
  const fixture = createPlayer(t);
  const records = [];
  const targetLog = Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(level=>[level,record=>records.push(record)]));
  const logger = new AuroraEvents({level:'debug',target:targetLog});
  logger.attach(fixture.manager);
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
  const observations = records.filter(record => record.eventCode.startsWith('MIGRATION_STAGE_'));
  const acknowledged = observations.filter(record => record.sanitizedContext.stageStatus === 'acknowledged');
  assert.deepEqual(acknowledged.map(record => record.sanitizedContext.stage), ['select-target', 'resolve-track', 'restore-player', 'persist-snapshot', 'cleanup-source']);
  assert.equal(new Set(observations.map(record => record.operationId)).size, 1);
  assert.equal(observations[0].operationId, records.find(record=>record.eventCode==='FAILOVER_STARTED').operationId);
  assert.ok(observations.every(record => record.durationMs >= 0 && !JSON.stringify(record).includes(player.guildId)));
});

test('failed destination restoration records rollback without claiming persisted destination state', async t => {
  const { player, target, logger, records } = migration(t);
  player.restart = async () => false;
  assert.equal(await player.transferNode(target), false);
  assert.ok(records.some(record => record.sanitizedContext.stage === 'restore-player' && record.sanitizedContext.stageStatus === 'failed'));
  assert.ok(records.some(record => record.sanitizedContext.stage === 'rollback' && record.sanitizedContext.stageStatus === 'acknowledged'));
  assert.ok(!records.some(record => record.sanitizedContext.stage === 'persist-snapshot' && record.sanitizedContext.stageStatus === 'acknowledged'));
  assert.ok(!records.some(record => record.sanitizedContext.stage === 'cleanup-source'));
});

test('source cleanup failure remains visible after confirmed destination commit', async t => {
  const { node, player, target, logger, records } = migration(t);
  player.restart = async () => true;
  node.rest.destroyPlayer = async () => { throw new Error('password=PRIVATE_CLEANUP'); };
  assert.equal(await player.transferNode(target), true);
  assert.equal(player.node, target);
  assert.ok(records.some(record => record.sanitizedContext.stage === 'cleanup-source' && record.sanitizedContext.stageStatus === 'failed'));
  assert.ok(!records.some(record => record.sanitizedContext.stage === 'cleanup-source' && record.sanitizedContext.stageStatus === 'acknowledged'));
  assert.ok(!JSON.stringify(records).includes('PRIVATE_CLEANUP'));
});

test('rollback storage failures are reported as partial rather than confirmed restoration', async t => {
  const { player, target, logger, records } = migration(t);
  const original = player.updateData;
  player.restart = async () => false;
  player.updateData = async () => { throw new Error('storage unavailable'); };
  try { assert.equal(await player.transferNode(target), false); }
  finally { player.updateData = original; }
  assert.ok(records.some(record => record.sanitizedContext.stage === 'rollback' && record.sanitizedContext.stageStatus === 'partial'));
  assert.ok(!records.some(record => record.sanitizedContext.stage === 'rollback' && record.sanitizedContext.stageStatus === 'acknowledged'));
});
