const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager, Node, NodeSelector, NodeFailover, BackendDetector } = require('../dist');
const { NodeState } = require('../dist/src/typings/types');
const { DatabaseManager } = require('../dist/src/managers/DatabaseManager');
const { playbackGuard } = require('../dist/src/players/PlaybackGuard');
const { createTrack, deferred } = require('./helpers/player.cjs');

function backend(kind = 'nodelink', features = []) {
  const adapter = BackendDetector.detect({
    version: { semver: kind === 'nodelink' ? '3.10.0' : '4.2.2' },
    isNodelink: kind === 'nodelink', sourceManagers: ['http'], filters: ['volume'],
  });
  for (const feature of features) adapter.recordFeature(feature, 'available');
  return adapter;
}

function audioNode(identifier, overrides = {}) {
  return {
    identifier, uuid: identifier, connected: true, destroyed: false, state: NodeState.READY,
    regions: [], backend: backend(),
    stats: { players: 1, cpu: { systemLoad: 0.1 }, memory: { used: 1, allocated: 10 } },
    ...overrides,
  };
}

function pool(t, descriptors, options = {}) {
  const manager = new Manager({
    nodes: [{ host: '127.0.0.1', port: 2333, password: 'test', secure: false }],
    send() {}, options: { node: options, database: { type: 'memory' } },
  });
  manager.database = new DatabaseManager(manager);
  const nodes = descriptors.map((description, index) => {
    const node = new Node(manager, {
      identifier: description.identifier, host: '127.0.0.1', port: 2400 + index,
      password: 'test', secure: false,
    });
    Object.assign(node, audioNode(description.identifier, description));
    node.rest.destroyPlayer = async () => {};
    node.rest.updatePlayer = async (_guild, payload) => payload;
    manager.nodes.nodes.set(node.identifier, node);
    return node;
  });
  t.after(async () => {
    for (const player of manager.players.all) player.stopHealthCheck();
    for (const node of nodes) await node.destroy();
    await manager.database.shutdown();
  });
  function create(requirements, extra = {}) {
    const player = manager.players.create({
      guildId: '123456789012345678', voiceChannelId: '223456789012345678',
      nodeSelection: requirements, ...extra,
    });
    player.stopHealthCheck();
    player.voice.connect = async () => {};
    player.voice.sessionId = 'test-session';
    player.voice.token = 'test-token';
    player.voice.endpoint = 'test.invalid';
    return player;
  }
  return { manager, nodes, create };
}

test('a required backend excludes unknown and incompatible nodes before load ranking', () => {
  const unknown = audioNode('unknown', { backend: undefined });
  const lavalink = audioNode('lavalink', { backend: backend('lavalink') });
  const nodelink = audioNode('nodelink', { stats: { players: 100 } });
  assert.equal(NodeSelector.select([unknown, lavalink, nodelink], {}, { backend: 'nodelink' }), nodelink);
});

test('required capabilities must all be available rather than guessed from the NodeLink name', () => {
  const unknown = audioNode('unknown');
  const unavailable = audioNode('unavailable', { backend: backend('nodelink', ['mixer']) });
  unavailable.backend.recordFeature('mixer', 'unavailable');
  const capable = audioNode('capable', { backend: backend('nodelink', ['mixer']), stats: { players: 100 } });
  assert.equal(NodeSelector.select([unknown, unavailable, capable], {}, { requiredCapabilities: ['mixer', 'source:http'] }), capable);
  assert.equal(NodeSelector.select([capable], {}, { requiredCapabilities: ['mixer', 'missing-plugin'] }), undefined);
});

test('unhealthy fallback never relaxes a hard capability requirement', () => {
  const healthy = audioNode('healthy');
  const overloaded = audioNode('overloaded', { backend: backend('nodelink', ['mixer']) });
  overloaded.stats.cpu.systemLoad = 0.99;
  const options = { avoidUnhealthyNodes: true };
  assert.equal(NodeSelector.select([healthy, overloaded], options, { requiredCapabilities: ['mixer'] }), overloaded);
  assert.equal(NodeSelector.select([healthy, overloaded], options, { requiredCapabilities: ['mixer'], allowUnhealthyFallback: false }), undefined);
});

test('a preferred region beats load within an eligible health class and otherwise permits a fallback', () => {
  const remote = audioNode('remote', { regions: ['us'] });
  const local = audioNode('local', { regions: ['eu'], stats: { players: 100 } });
  assert.equal(NodeSelector.select([remote, local], {}, { region: 'eu' }), local);
  assert.equal(NodeSelector.select([remote], {}, { region: 'eu' }), remote);
});

test('a soft region preference does not prefer an overloaded node over a healthy candidate', () => {
  const healthy = audioNode('healthy', { regions: ['us'] });
  const overloaded = audioNode('overloaded', { regions: ['eu'] });
  overloaded.stats.cpu.systemLoad = 0.99;
  assert.equal(NodeSelector.select([healthy, overloaded], { avoidUnhealthyNodes: true }, { region: 'eu' }), healthy);
});

test('a required region never falls back to an unlabelled or different region', () => {
  const unlabelled = audioNode('unlabelled');
  const remote = audioNode('remote', { regions: ['us'] });
  assert.equal(NodeSelector.select([unlabelled, remote], {}, { region: 'eu', regionPolicy: 'require' }), undefined);
});

test('constrained work requires READY while an unconstrained request retains its connected fallback', () => {
  const connected = audioNode('connected', { state: NodeState.CONNECTED, backend: backend('nodelink', ['mixer']), regions: ['eu'] });
  assert.equal(NodeSelector.select([connected]), connected);
  for (const requirement of [{ backend: 'nodelink' }, { requiredCapabilities: ['mixer'] }, { region: 'eu' }]) {
    assert.equal(NodeSelector.select([connected], {}, requirement), undefined);
  }
});

test('selection diagnostics identify hard rejections and their missing capabilities', () => {
  const capable = audioNode('capable', { backend: backend('nodelink', ['mixer']), regions: ['eu'] });
  const incompatible = audioNode('incompatible', { backend: backend('lavalink'), regions: ['us'] });
  const rejected = NodeSelector.rejections([capable, incompatible], {}, { backend: 'nodelink', requiredCapabilities: ['mixer'], region: 'eu', regionPolicy: 'require' });
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].identifier, incompatible.identifier);
  assert.deepEqual(new Set(rejected[0].reasons), new Set(['backend', 'capability', 'region']));
  assert.deepEqual(rejected[0].missingCapabilities, ['mixer']);
});

for (const requirements of [
  { backend: 'unknown' }, { requiredCapabilities: 'mixer' }, { requiredCapabilities: [false] },
  { requiredCapabilities: [''] }, { region: 1 }, { region: '' },
  { regionPolicy: 'nearby' }, { regionPolicy: 'require' },
]) {
  test(`invalid node requirements reject before selecting: ${JSON.stringify(requirements)}`, () => {
    assert.throws(() => NodeSelector.select([audioNode('available')], {}, requirements), TypeError);
  });
}

test('creating a player obeys its requirements and persists an immutable copy', async t => {
  const { manager, nodes: [incompatible, compatible], create } = pool(t, [
    { identifier: 'incompatible', backend: backend('lavalink') },
    { identifier: 'compatible', backend: backend('nodelink', ['mixer']), regions: ['eu'] },
  ]);
  const requirements = { backend: 'nodelink', requiredCapabilities: ['mixer'], region: 'eu', regionPolicy: 'require' };
  const expected = structuredClone(requirements);
  const player = create(requirements);
  assert.equal(player.node, compatible);
  requirements.requiredCapabilities.splice(0);
  requirements.backend = 'lavalink';
  assert.deepEqual(player.nodeSelection, expected);
  assert.ok(Object.isFrozen(player.nodeSelection));
  assert.ok(Object.isFrozen(player.nodeSelection.requiredCapabilities));
  assert.deepEqual(await manager.database.get(`players.${player.guildId}.nodeSelection`), expected);
  assert.equal(manager.players.create({ guildId: player.guildId, voiceChannelId: player.voiceChannelId, nodeSelection: { backend: 'lavalink' } }), player);
  assert.equal(player.node, compatible);
  assert.notEqual(player.node, incompatible);
});

test('creating a player without a capable node raises a typed diagnostic and leaves the pool unchanged', t => {
  const { manager, create } = pool(t, [{ identifier: 'unknown' }]);
  assert.throws(() => create({ requiredCapabilities: ['mixer'] }), error => {
    assert.equal(error.constructor.name, 'NoEligibleNodeError');
    assert.equal(error.code, 'NO_ELIGIBLE_NODE');
    assert.equal(error.rejections[0].identifier, 'unknown');
    assert.ok(error.rejections[0].reasons.includes('capability'));
    assert.deepEqual(error.rejections[0].missingCapabilities, ['mixer']);
    return true;
  });
  assert.equal(manager.players.size, 0);
});

test('a rejected explicit transfer preserves the current attempt and never touches either server', async t => {
  const { nodes: [source, target], create } = pool(t, [
    { identifier: 'source', backend: backend('nodelink', ['mixer']) },
    { identifier: 'target', backend: backend('lavalink') },
  ]);
  const player = create({ backend: 'nodelink', requiredCapabilities: ['mixer'] });
  const current = createTrack('current');
  player.current = current;
  player.queue.add(createTrack('queued'));
  let effects = 0;
  source.rest.destroyPlayer = target.rest.updatePlayer = player.voice.connect = async () => { effects++; };
  const ticket = playbackGuard(player).ticket;
  assert.equal(await player.transferNode(target), false);
  assert.equal(effects, 0);
  assert.equal(playbackGuard(player).ticket, ticket);
  assert.equal(player.node, source);
  assert.equal(player.current, current);
  assert.equal(player.queue.size, 1);
});

test('failover skips incompatible destinations without using its bounded attempt budget', async t => {
  const { nodes: [source, incompatible, compatible], create } = pool(t, [
    { identifier: 'source', backend: backend('nodelink', ['mixer']) },
    { identifier: 'incompatible', backend: backend('nodelink') },
    { identifier: 'compatible', backend: backend('nodelink', ['mixer']) },
  ]);
  const player = create({ requiredCapabilities: ['mixer'] });
  player.current = createTrack('current');
  let incompatibleRequests = 0;
  incompatible.rest.updatePlayer = async () => { incompatibleRequests++; throw new Error('ineligible'); };
  const result = await NodeFailover.move(player, source, { maxAttempts: 1 });
  assert.equal(result.status, 'recovered');
  assert.equal(result.attempts, 1);
  assert.equal(player.node, compatible);
  assert.equal(incompatibleRequests, 0);
});

test('failover without an eligible destination keeps the snapshot without attempting a transfer', async t => {
  const { nodes: [source, incompatible], create } = pool(t, [
    { identifier: 'source', backend: backend('nodelink', ['mixer']) },
    { identifier: 'incompatible', backend: backend('nodelink') },
  ]);
  const player = create({ requiredCapabilities: ['mixer'] });
  const current = createTrack('current');
  const queued = createTrack('queued');
  player.current = current;
  player.queue.add(queued);
  let effects = 0;
  source.rest.destroyPlayer = incompatible.rest.updatePlayer = async () => { effects++; return {}; };
  const result = await NodeFailover.move(player, source);
  assert.equal(result.status, 'failed');
  assert.equal(result.attempts, 0);
  assert.equal(effects, 0);
  assert.equal(player.node, source);
  assert.equal(player.current, current);
  assert.deepEqual(player.queue.tracks, [queued]);
  assert.equal(player.destroyed, false);
});

test('capability loss while waiting for another command cancels a queued transfer before source cleanup', async t => {
  const { nodes: [source, target], create } = pool(t, [
    { identifier: 'source', backend: backend('nodelink', ['mixer']) },
    { identifier: 'target', backend: backend('nodelink', ['mixer']) },
  ]);
  const player = create({ requiredCapabilities: ['mixer'] });
  const started = deferred();
  const released = deferred();
  source.rest.updatePlayer = async (_guild, payload) => {
    started.resolve();
    await released.promise;
    return payload;
  };
  let sourceCleanup = 0;
  source.rest.destroyPlayer = async () => { sourceCleanup++; };
  const settingVolume = player.setVolumeAsync(50);
  await started.promise;
  const migrating = player.transferNode(target);
  target.backend.recordFeature('mixer', 'unavailable');
  released.resolve();
  await settingVolume;
  assert.equal(await migrating, false);
  assert.equal(sourceCleanup, 0);
  assert.equal(player.node, source);
});

test('capability loss during asynchronous resolution cancels migration before source cleanup', async t => {
  const { nodes: [source, target], create } = pool(t, [
    { identifier: 'source', backend: backend('nodelink', ['mixer']) },
    { identifier: 'target', backend: backend('nodelink', ['mixer']) },
  ]);
  const player = create({ requiredCapabilities: ['mixer'] });
  const current = createTrack('current');
  current.pluginInfo.needsStream = true;
  player.current = current;
  const started = deferred();
  const released = deferred();
  target.rest.loadTracks = async () => {
    started.resolve();
    await released.promise;
    return { loadType: 'track', data: current.toJSON() };
  };
  let sourceCleanup = 0;
  let targetUpdates = 0;
  source.rest.destroyPlayer = async () => { sourceCleanup++; };
  target.rest.updatePlayer = async () => { targetUpdates++; return {}; };
  const migrating = player.transferNode(target);
  await started.promise;
  target.backend.recordFeature('mixer', 'unavailable');
  released.resolve();
  assert.equal(await migrating, false);
  assert.equal(sourceCleanup, 0);
  assert.equal(targetUpdates, 0);
  assert.equal(player.node, source);
  assert.equal(player.current, current);
});

for (const boundary of ['command queue', 'track resolution']) {
  test(`a transfer rejected after waiting for ${boundary} retains the accepted source attempt`, async t => {
    const { nodes: [source, target], create } = pool(t, [
      { identifier: 'source', backend: backend('nodelink', ['mixer']) },
      { identifier: 'target', backend: backend('nodelink', ['mixer']) },
    ]);
    const player = create({ requiredCapabilities: ['mixer'] });
    player.setAutoPlay(false);
    const requests = [];
    source.rest.updatePlayer = async (_guild, payload) => { requests.push(payload); return payload; };
    const current = createTrack('accepted-source');
    assert.equal(await player.play({ track: current }), true);
    const wire = { ...current.toJSON(), userData: structuredClone(requests[0].track.userData) };
    await source.handleTrackStart(player, { track: wire });
    const next = createTrack('next');
    const following = createTrack('following');
    player.queue.add([next, following]);
    const started = deferred();
    const released = deferred();
    let blocking;
    if (boundary === 'command queue') {
      source.rest.updatePlayer = async (_guild, payload) => {
        requests.push(payload);
        if (payload.volume === 50 && !payload.track) {
          started.resolve();
          await released.promise;
        }
        return payload;
      };
      blocking = player.setVolumeAsync(50);
      await started.promise;
    } else {
      current.pluginInfo.needsStream = true;
      target.rest.loadTracks = async () => {
        started.resolve();
        await released.promise;
        return { loadType: 'track', data: current.toJSON() };
      };
    }
    const migrating = player.transferNode(target);
    if (boundary === 'track resolution') await started.promise;
    target.backend.recordFeature('mixer', 'unavailable');
    released.resolve();
    if (blocking) await blocking;
    assert.equal(await migrating, false);
    assert.equal(player.node, source);

    await Promise.all(Array.from({ length: 2 }, () =>
      source.handleTrackEnd(player, { reason: 'finished', track: structuredClone(wire) })));

    assert.equal(player.current, next);
    assert.deepEqual(player.queue.tracks, [following]);
    assert.equal(requests.filter(payload => payload.track?.encoded).length, 2);
  });
}
