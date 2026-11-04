const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager, Node, NodeState, NodeFailover } = require('../dist');
const { playbackGuard } = require('../dist/src/players/PlaybackGuard');
const { createTrack, deferred } = require('./helpers/player.cjs');

const turn = () => new Promise(resolve => setImmediate(resolve));

function pool(t, nodeOptions = {}) {
  const manager = new Manager({
    nodes: [{ host: '127.0.0.1', port: 2333, password: 'test', secure: false }],
    options: { node: nodeOptions, database: { type: 'memory' } },
  });
  const nodes = ['source', 'target'].map((identifier, index) => {
    const node = new Node(manager, { identifier, host: '127.0.0.1', port: 2400 + index, password: 'test', secure: false });
    node.connected = true;
    node.state = NodeState.READY;
    node.stats = { players: 0, cpu: { systemLoad: 0.1 }, memory: { used: 1, allocated: 10 } };
    manager.nodes.nodes.set(identifier, node);
    return node;
  });
  t.after(() => manager.shutdown());
  const [source, target] = nodes;
  let active = 0;
  let maximum = 0;
  const started = [];
  function player(id, restore = async () => true) {
    const value = {
      manager, node: source, guildId: String(id), destroyed: false, nodeSelection: {},
      current: createTrack(`current-${id}`), queue: { tracks: [createTrack(`queued-${id}`)] },
      stop() { playbackGuard(this).invalidate(); this.current = null; return Promise.resolve(this); },
      async transferNode(destination) {
        const guard = playbackGuard(this);
        const ticket = guard.invalidate();
        started.push(id);
        active++;
        maximum = Math.max(maximum, active);
        try {
          const restored = await restore(destination);
          if (!guard.isCurrent(ticket) || this.destroyed) return false;
          if (restored) this.node = destination;
          return restored;
        } finally { active--; }
      },
    };
    return value;
  }
  return { manager, source, target, player, started, get active() { return active; }, get maximum() { return maximum; } };
}

test('100 guild recoveries obey the manager concurrency budget and deduplicate without queue reordering', async t => {
  const lab = pool(t, { recoveryConcurrency: 3, recoveryQueueLimit: 100 });
  const gates = Array.from({ length: 100 }, () => deferred());
  const players = gates.map((gate, index) => lab.player(index, () => gate.promise));
  const recoveries = players.map(player => NodeFailover.move(player, lab.source));
  const duplicates = players.map(player => NodeFailover.move(player, lab.source));
  t.after(async () => { gates.forEach(gate => gate.resolve(true)); await Promise.allSettled(recoveries); });
  for (let index = 0; index < recoveries.length; index++) assert.equal(recoveries[index], duplicates[index]);
  await turn();
  assert.equal(lab.active, 3);
  assert.deepEqual(lab.started, [0, 1, 2]);
  for (const gate of gates) { gate.resolve(true); await turn(); }
  const results = await Promise.all(recoveries);
  assert.equal(lab.maximum, 3);
  assert.deepEqual(lab.started, Array.from({ length: 100 }, (_, index) => index));
  assert.ok(results.every(result => result.status === 'recovered' && result.attempts === 1));
});

test('a queued stop cancels before transfer and cannot be recaptured as a new intent', async t => {
  const lab = pool(t, { recoveryConcurrency: 1 });
  const gate = deferred();
  const active = lab.player('active', () => gate.promise);
  const queued = lab.player('queued');
  const first = NodeFailover.move(active, lab.source);
  const second = NodeFailover.move(queued, lab.source);
  t.after(async () => { gate.resolve(true); await Promise.allSettled([first, second]); });
  await turn();
  await queued.stop();
  gate.resolve(true);
  await first;
  assert.deepEqual(await second, { status: 'cancelled', attempts: 0 });
  assert.deepEqual(lab.started, ['active']);
  assert.equal(queued.node, lab.source);
  assert.equal(queued.current, null);
});

for (const change of ['owner changed', 'player destroyed', 'source destroyed', 'manager shut down']) {
  test(`queued recovery revalidates before execution when ${change}`, async t => {
    const lab = pool(t, { recoveryConcurrency: 1 });
    const gate = deferred();
    const active = lab.player('active', () => gate.promise);
    const queued = lab.player('queued');
    const first = NodeFailover.move(active, lab.source);
    const second = NodeFailover.move(queued, lab.source);
    t.after(async () => { gate.resolve(true); await Promise.allSettled([first, second]); });
    await turn();
    if (change === 'owner changed') queued.node = lab.target;
    if (change === 'player destroyed') queued.destroyed = true;
    if (change === 'source destroyed') await lab.source.destroy();
    if (change === 'manager shut down') await lab.manager.shutdown();
    gate.resolve(true);
    await first;
    assert.deepEqual(await second, { status: 'cancelled', attempts: 0 });
    assert.deepEqual(lab.started, ['active']);
  });
}

test('the default recovery budget admits four active guilds', async t => {
  const lab = pool(t);
  const gate = deferred();
  const recoveries = Array.from({ length: 5 }, (_, index) => NodeFailover.move(lab.player(index, () => gate.promise), lab.source));
  t.after(async () => { gate.resolve(true); await Promise.allSettled(recoveries); });
  await turn();
  assert.equal(lab.active, 4);
  assert.deepEqual(lab.started, [0, 1, 2, 3]);
  gate.resolve(true);
  assert.ok((await Promise.all(recoveries)).every(result => result.status === 'recovered'));
  assert.equal(lab.maximum, 4);
});

test('a recovery requested for a node that no longer owns its player is cancelled without transfer', async t => {
  const lab = pool(t);
  const player = lab.player('already-moved');
  player.node = lab.target;
  assert.deepEqual(await NodeFailover.move(player, lab.source), { status: 'cancelled', attempts: 0 });
  assert.deepEqual(lab.started, []);
});

test('queue overflow fails once without consuming an attempt or modifying the rejected player snapshot', async t => {
  const lab = pool(t, { recoveryConcurrency: 1, recoveryQueueLimit: 1 });
  const gate = deferred();
  const firstPlayer = lab.player('active', () => gate.promise);
  const queuedPlayer = lab.player('queued');
  const rejectedPlayer = lab.player('overflow');
  const current = rejectedPlayer.current;
  const queuedTracks = [...rejectedPlayer.queue.tracks];
  let failures = 0;
  lab.manager.on('playerRecoveryFailed', player => { if (player === rejectedPlayer) failures++; });
  const first = NodeFailover.move(firstPlayer, lab.source);
  const second = NodeFailover.move(queuedPlayer, lab.source);
  const rejected = NodeFailover.move(rejectedPlayer, lab.source);
  const duplicate = NodeFailover.move(rejectedPlayer, lab.source);
  t.after(async () => { gate.resolve(true); await Promise.allSettled([first, second, rejected, duplicate]); });
  assert.equal(rejected, duplicate);
  assert.deepEqual(await rejected, { status: 'failed', attempts: 0, reason: 'queue-full' });
  assert.equal(failures, 1);
  assert.equal(rejectedPlayer.node, lab.source);
  assert.equal(rejectedPlayer.destroyed, false);
  assert.equal(rejectedPlayer.current, current);
  assert.deepEqual(rejectedPlayer.queue.tracks, queuedTracks);
  gate.resolve(true);
  assert.equal((await first).status, 'recovered');
  assert.equal((await second).status, 'recovered');
});

test('zero waiting capacity admits an available slot and rejects excess work without hanging', async t => {
  const lab = pool(t, { recoveryConcurrency: 1, recoveryQueueLimit: 0 });
  const gate = deferred();
  const first = NodeFailover.move(lab.player('active', () => gate.promise), lab.source);
  const second = NodeFailover.move(lab.player('overflow'), lab.source);
  t.after(async () => { gate.resolve(true); await Promise.allSettled([first, second]); });
  await turn();
  assert.deepEqual(await second, { status: 'failed', attempts: 0, reason: 'queue-full' });
  gate.resolve(true);
  assert.equal((await first).status, 'recovered');
});

test('manager budgets are independent rather than sharing a process-wide recovery slot', async t => {
  const first = pool(t, { recoveryConcurrency: 1 });
  const second = pool(t, { recoveryConcurrency: 1 });
  const gates = [deferred(), deferred()];
  const recoveries = [
    NodeFailover.move(first.player('first', () => gates[0].promise), first.source),
    NodeFailover.move(second.player('second', () => gates[1].promise), second.source),
  ];
  t.after(async () => { gates.forEach(gate => gate.resolve(true)); await Promise.allSettled(recoveries); });
  await turn();
  assert.equal(first.active, 1);
  assert.equal(second.active, 1);
  gates.forEach(gate => gate.resolve(true));
  assert.ok((await Promise.all(recoveries)).every(result => result.status === 'recovered'));
});

test('the manager captures its limits on first use rather than adopting mutable options during an outage', async t => {
  const lab = pool(t, { recoveryConcurrency: 1 });
  const gate = deferred();
  const first = NodeFailover.move(lab.player('active', () => gate.promise), lab.source);
  await turn();
  lab.manager.options.node.recoveryConcurrency = 100;
  const second = NodeFailover.move(lab.player('queued'), lab.source);
  t.after(async () => { gate.resolve(true); await Promise.allSettled([first, second]); });
  await turn();
  assert.equal(lab.active, 1);
  assert.deepEqual(lab.started, ['active']);
  gate.resolve(true);
  assert.ok((await Promise.all([first, second])).every(result => result.status === 'recovered'));
  assert.equal(lab.maximum, 1);
});

test('a failed transfer releases the recovery slot for the next waiting guild', async t => {
  const lab = pool(t, { recoveryConcurrency: 1 });
  const first = NodeFailover.move(lab.player('failed', async () => { throw new Error('restore failed'); }), lab.source, { maxAttempts: 1 });
  const second = NodeFailover.move(lab.player('waiting'), lab.source);
  const [failed, recovered] = await Promise.all([first, second]);
  assert.equal(failed.status, 'failed');
  assert.equal(recovered.status, 'recovered');
  assert.deepEqual(lab.started, ['failed', 'waiting']);
  assert.equal(lab.maximum, 1);
});

test('an unexpected selection error releases its slot rather than wedging the queue', async t => {
  const lab = pool(t, { recoveryConcurrency: 1 });
  const select = lab.manager.nodes.findNode.bind(lab.manager.nodes);
  let calls = 0;
  t.mock.method(lab.manager.nodes, 'findNode', options => {
    if (++calls === 1) throw new Error('selection failed');
    return select(options);
  });
  const first = assert.rejects(NodeFailover.move(lab.player('broken'), lab.source), /selection failed/);
  const second = NodeFailover.move(lab.player('waiting'), lab.source);
  await first;
  assert.equal((await second).status, 'recovered');
  assert.deepEqual(lab.started, ['waiting']);
});

for (const options of [
  { recoveryConcurrency: 0 }, { recoveryConcurrency: 101 }, { recoveryConcurrency: 1.5 },
  { recoveryConcurrency: NaN }, { recoveryQueueLimit: -1 }, { recoveryQueueLimit: 10001 },
  { recoveryQueueLimit: 1.5 },
]) {
  test(`invalid recovery budget rejects before transfer: ${JSON.stringify(options)}`, async t => {
    const lab = pool(t, options);
    await assert.rejects(NodeFailover.move(lab.player('invalid'), lab.source), TypeError);
    assert.deepEqual(lab.started, []);
  });
}
