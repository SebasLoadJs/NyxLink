const test = require('node:test');
const assert = require('node:assert/strict');
const { AuroraEvents, TerminalDashboard, Node, NodeState } = require('../dist');
const { createPlayer, createTrack } = require('./helpers/player.cjs');

test('dashboard construction is silent and reflects real queue and runtime observations', async t => {
  const { manager, node, player } = createPlayer(t);
  const records = [];
  const route = new AuroraEvents({level:'info',target:Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(level=>[level,record=>records.push(record)]))});
  route.attach(manager); t.after(()=>route.close());
  player.current = createTrack('current'); player.playing = true;
  player.queue.add(createTrack('next'));
  const dashboard = new TerminalDashboard(manager, { mode: 'static' });
  assert.deepEqual(records, []);
  const snapshot = dashboard.snapshot();
  assert.equal(snapshot.audio.players, 1);
  assert.equal(snapshot.audio.playing, 1);
  assert.equal(snapshot.audio.queuedTracks, 1);
  assert.ok(snapshot.runtime.heapUsedBytes > 0);
  assert.ok(snapshot.runtime.rssBytes >= snapshot.runtime.heapUsedBytes);
  assert.equal(snapshot.nodes[0].id, node.identifier);
  assert.equal(snapshot.nodes[0].cpuLoad, undefined, 'missing stats are never fabricated');
  assert.deepEqual(snapshot.sources, []);
});

test('static dashboard starts once, stops idempotently and emits detached structured snapshots', async t => {
  const { manager, player } = createPlayer(t);
  const records = [];
  const route = new AuroraEvents({level:'info',target:Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(level=>[level,record=>records.push(record)]))});
  route.attach(manager); t.after(()=>route.close());
  const dashboard = new TerminalDashboard(manager, { mode: 'static' });
  const stop = dashboard.start(); dashboard.start();
  assert.equal(records.length, 1);
  assert.doesNotMatch(JSON.stringify(records),/guildId|nodeId|password/);
  assert.equal(records[0].eventCode, 'DASHBOARD_SNAPSHOT');
  assert.equal(records[0].sanitizedContext.playerCount, 1);
  stop(); stop(); dashboard.start();
  assert.equal(records.length, 2);
  assert.equal(player.destroyed, false);
  dashboard.stop();
});

test('dashboard suppresses stale disconnected node stats and source health', async t => {
  const { manager, node } = createPlayer(t);
  const dashboard = new TerminalDashboard(manager);
  node.stats = { cpu: { systemLoad: 0.25 }, memory: { used: 1234 } };
  node.statsReceivedAt = Date.now() - 100;
  node.sourceHealth.apply({ op: 'event', type: 'SourceHealthChangeEvent', source: 'http', previousStatus: 'idle', status: 'healthy', timestamp: Date.now(), successRate: 100 });
  let snapshot = dashboard.snapshot();
  assert.equal(snapshot.nodes[0].cpuLoad, 0.25);
  assert.equal(snapshot.sources[0].status, 'healthy');
  node.connected = false; node.state = NodeState.DISCONNECTED;
  snapshot = dashboard.snapshot();
  assert.equal(snapshot.nodes[0].cpuLoad, undefined);
  assert.deepEqual(snapshot.sources, []);
});

test('dashboard bounds source and node output without reporting invented totals', async t => {
  const { manager, node } = createPlayer(t);
  const second = new Node(manager, { identifier: 'second', host: '127.0.0.1', port: 2444, password: 'fixture' });
  manager.nodes.nodes.set(second.identifier, second);
  t.after(() => second.destroy());
  for (const source of ['http', 'local']) node.sourceHealth.apply({ op: 'event', type: 'SourceHealthChangeEvent', source, previousStatus: 'unknown', status: 'idle', timestamp: Date.now() });
  const dashboard = new TerminalDashboard(manager, { maxNodes: 1, maxSources: 1 });
  const snapshot = dashboard.snapshot();
  assert.equal(snapshot.nodes.length, 1); assert.equal(snapshot.truncatedNodes, 1);
  assert.equal(snapshot.sources.length, 1); assert.equal(snapshot.truncatedSources, 1);
});

test('dashboard rejects invalid sampling and output limits', async t => {
  const { manager } = createPlayer(t);
  for (const options of [{ intervalMs: 1 }, { maxNodes: 0 }, { maxSources: Infinity }, { mode: 'invalid' }]) {
    assert.throws(() => new TerminalDashboard(manager, options), TypeError);
  }
});
