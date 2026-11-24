const test = require('node:test');
const assert = require('node:assert/strict');
const { PerformanceMonitor, NodeState } = require('../dist');
const { playbackGuard } = require('../dist/src/players/PlaybackGuard');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');

test('monitor is opt-in, bounded, reports unknown percentiles and detaches on close', async t => {
  const { manager } = createPlayer(t);
  const before = manager.listenerCount();
  const monitor = new PerformanceMonitor(manager, { sampleLimit: 3 });
  assert.equal(manager.listenerCount(), before);
  assert.equal(monitor.snapshot().durations.rest.p95Ms, undefined);
  monitor.start(); assert.ok(manager.listenerCount() > before);
  for (const value of [1000, 1, 2, 3, 4]) monitor.observe('rest', value);
  for (const value of [-1, NaN, Infinity]) monitor.observe('rest', value);
  const result = monitor.snapshot();
  assert.deepEqual(result.durations.rest, { count: 5, retained: 3, p50Ms: 3, p95Ms: 4, maxMs: 4 });
  assert.ok(result.runtime.rssBytes > 0); assert.equal(result.resources.managerListeners, manager.listenerCount());
  monitor.close(); monitor.close(); assert.equal(manager.listenerCount(), before);
  monitor.observe('rest', 500); assert.equal(monitor.snapshot().durations.rest.count, 5);
  assert.throws(() => monitor.start(), /closed/);
});

test('measure preserves values/errors and settles in-flight counts even if closed', async t => {
  const { manager } = createPlayer(t);
  const monitor = manager.startPerformanceMonitor(); t.after(() => monitor.close());
  const release = deferred();
  const pending = monitor.measure('rest', () => release.promise);
  assert.equal(monitor.snapshot().resources.pendingRequests, 1);
  release.resolve(42); assert.equal(await pending, 42);
  const failure = new Error('original');
  await assert.rejects(monitor.measure('streamOpen', async () => { throw failure; }), error => error === failure);
  assert.equal(monitor.snapshot().counters.streamOpenErrors, 1);
  assert.equal(monitor.snapshot().durations.rest.count, 1);
  const next = deferred(), last = monitor.measure('rest', () => next.promise);
  monitor.close(); next.resolve(); await last;
  assert.equal(monitor.snapshot().resources.pendingRequests, 0);
});

test('lifecycle timings require matching observations and reject stale playback/session callbacks', async t => {
  const { manager, node, player } = createPlayer(t);
  const monitor = manager.startPerformanceMonitor(); t.after(() => monitor.close());
  manager.emit('nodeReady', node, {}); assert.equal(monitor.snapshot().durations.nodeReady.count, 0);
  manager.emit('nodeStateChange', node, NodeState.DISCONNECTED, NodeState.CONNECTING);
  manager.emit('nodeReady', node, {}); manager.emit('nodeReady', node, {});
  const track = createTrack('observed');
  manager.emit('playerTriggeredPlay', player, track); manager.emit('trackStart', player, track);
  manager.emit('playerTriggeredPlay', player, track); playbackGuard(player).invalidate(); manager.emit('trackStart', player, track);
  manager.emit('playerTriggeredPlay', player, track); node.sessionId = 'new'; manager.emit('trackStart', player, track);
  manager.emit('playerRecoveryStarted', player); manager.emit('playerRecoverySuccess', player);
  const snapshot = monitor.snapshot();
  assert.equal(snapshot.durations.nodeReady.count, 1);
  assert.equal(snapshot.durations.playbackStart.count, 1);
  assert.equal(snapshot.durations.recovery.count, 1);
  assert.doesNotMatch(JSON.stringify(snapshot), /observed|123456789012345678|test-node/);
});

test('manager owns monitor cleanup and queued command counts include rejected commands', async t => {
  const { manager, player, node } = createPlayer(t);
  const monitor = manager.startPerformanceMonitor();
  assert.equal(manager.startPerformanceMonitor(), monitor);
  const entered = deferred(), release = deferred();
  node.rest.updatePlayer = async () => { entered.resolve(); await release.promise; throw new Error('reject'); };
  const volume = assert.rejects(player.setVolumeAsync(42)); await entered.promise;
  assert.equal(player.pendingCommands, 1);
  release.resolve(); await volume;
  assert.equal(player.pendingCommands, 0);
  await manager.shutdown(); assert.equal(monitor.running, false);
});

test('invalid monitor limits fail before attaching resources', async t => {
  const { manager } = createPlayer(t);
  for (const options of [{ sampleLimit: 0 }, { sampleLimit: Infinity }, { eventLoopResolutionMs: 1 }, { maxPendingMs: -1 }]) {
    assert.throws(() => new PerformanceMonitor(manager, options), TypeError);
  }
});
