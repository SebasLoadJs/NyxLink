const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager, Node, NodeState, BackendDetector, HttpError, TrackCodec } = require('../dist');
const { DatabaseManager } = require('../dist/src/managers/DatabaseManager');
const { createTrack, deferred } = require('./helpers/player.cjs');

const firstGuild = '123456789012345678';
const secondGuild = '323456789012345678';
const voiceChannelId = '223456789012345678';

function pool(t, options = {}) {
  const manager = new Manager({
    nodes: [{ host: '127.0.0.1', port: 2333, password: 'test', secure: false }], send() {},
    options: { database: { type: 'memory' }, node: { circuitBreaker: { failureThreshold: 1 }, ...options } },
  });
  manager.database = new DatabaseManager(manager);
  const nodes = ['source', 'target'].map((identifier, index) => {
    const node = new Node(manager, { identifier, host: '127.0.0.1', port: 2400 + index, password: 'test', secure: false });
    node.connected = true;
    node.state = NodeState.READY;
    node.sessionId = `${identifier}-session`;
    node.backend = BackendDetector.detect({ version: { semver: '4.2.2' }, sourceManagers: ['http'], filters: ['volume'] });
    node.stats = { players: index * 100, cpu: { systemLoad: 0.1 }, memory: { used: 1, allocated: 10 } };
    node.rest.updatePlayer = async (_guild, payload) => payload;
    node.rest.destroyPlayer = async () => {};
    manager.nodes.nodes.set(identifier, node);
    return node;
  });
  const created = [];
  manager.on('playerCreate', player => {
    created.push(player);
    player.stopHealthCheck();
    player.voice.connect = async () => {};
  });
  t.after(async () => {
    for (const player of created) player.stopHealthCheck();
    for (const node of nodes) await node.destroy();
    await manager.database.shutdown();
  });
  function create(config = {}) {
    return manager.players.create({ guildId: firstGuild, voiceChannelId, autoPlay: false, ...config });
  }
  return { manager, nodes, create, created };
}

function stored(guildId, extra = {}) {
  return { guildId, voiceChannelId, autoPlay: false, current: TrackCodec.serialize(createTrack(`stored-${guildId}`)), ...extra };
}

function remote(guildId, extra = {}) {
  return {
    guildId, track: createTrack(`stored-${guildId}`).toJSON(), volume: 65, paused: false,
    state: { position: 42000, time: Date.now(), connected: true, ping: 3 },
    voice: { token: 'test-voice-token', endpoint: 'test.invalid', sessionId: 'test-voice-session' },
    filters: {}, ...extra,
  };
}

test('explicit player node wins over an otherwise less-loaded candidate and is persisted', async t => {
  const { manager, nodes: [, target], create } = pool(t);
  const player = create({ node: target.identifier });
  assert.equal(player.node, target);
  assert.equal(await manager.database.get(`players.${firstGuild}.node`), target.identifier);
});

test('an unavailable named node never falls back to an unrelated eligible node', t => {
  const { manager, create } = pool(t);
  assert.throws(() => create({ node: 'missing' }), error => {
    assert.equal(error.code, 'NO_ELIGIBLE_NODE');
    assert.deepEqual(error.rejections, [{ identifier: 'missing', reasons: ['not-found'] }]);
    return true;
  });
  assert.equal(manager.players.size, 0);
});

for (const node of ['', 123, null]) {
  test(`invalid explicit node is rejected before assignment: ${JSON.stringify(node)}`, t => {
    const { manager, create } = pool(t);
    assert.throws(() => create({ node }), TypeError);
    assert.equal(manager.players.size, 0);
  });
}

for (const state of ['disconnected', 'destroyed', 'draining', 'circuit', 'backend', 'capability']) {
  test(`an explicit node rejected for ${state} cannot silently balance onto another node`, async t => {
    const { manager, nodes: [, target], create } = pool(t);
    let nodeSelection;
    if (state === 'disconnected') target.connected = false;
    if (state === 'destroyed') await target.destroy();
    if (state === 'draining') target.draining = true;
    if (state === 'circuit') await assert.rejects(target.circuit.run(async () => { throw new HttpError(503); }));
    if (state === 'backend') nodeSelection = { backend: 'nodelink' };
    if (state === 'capability') nodeSelection = { requiredCapabilities: ['missing-feature'] };
    assert.throws(() => create({ node: target.identifier, nodeSelection }), { code: 'NO_ELIGIBLE_NODE' });
    assert.equal(manager.players.size, 0);
  });
}

test('creating an existing guild retains its original node and playback intent', t => {
  const { nodes: [source, target], create } = pool(t);
  const player = create();
  player.current = createTrack('current');
  assert.equal(create({ node: target.identifier }), player);
  assert.equal(player.node, source);
  assert.equal(player.current.identifier, 'current');
});

test('an old node session cannot overwrite a player that belongs to another node', async t => {
  const { manager, nodes: [source, target], create } = pool(t);
  const player = create();
  player.node = target;
  player.current = createTrack('new-current');
  player.current.position = 123;
  player.paused = true;
  player.playing = false;
  const resumed = [];
  manager.on('playerResumed', value => resumed.push(value));
  source.rest.getPlayers = async () => [remote(firstGuild)];
  await source._resumePlayers();
  assert.equal(player.node, target);
  assert.equal(player.paused, true);
  assert.equal(player.playing, false);
  assert.equal(player.current.position, 123);
  assert.deepEqual(resumed, []);
});

test('confirmed-session restore can adopt a maintenance node without creating new playback work', async t => {
  const { manager, nodes: [, target] } = pool(t);
  assert.equal(typeof manager.players.restore, 'function');
  target.draining = true;
  await assert.rejects(target.circuit.run(async () => { throw new HttpError(503); }));
  let requests = 0;
  target.rest.updatePlayer = async () => { requests++; return {}; };
  const player = manager.players.restore(stored(firstGuild, { node: target.identifier, nodeSelection: { requiredCapabilities: ['source:http'] } }));
  assert.equal(player.node, target);
  assert.equal(target.draining, true);
  assert.equal(target.circuit.state, 'open');
  assert.equal(requests, 0);
  assert.equal(await manager.database.get(`players.${firstGuild}.node`), target.identifier);
});

test('confirmed-session restore requires an explicit eligible owner and retains hard requirements', t => {
  const { manager, nodes: [, target] } = pool(t);
  assert.equal(typeof manager.players.restore, 'function');
  assert.throws(() => manager.players.restore(stored(firstGuild)), TypeError);
  assert.throws(() => manager.players.restore(stored(firstGuild, { node: 'missing' })), { code: 'NO_ELIGIBLE_NODE' });
  target.draining = true;
  assert.throws(() => manager.players.restore(stored(firstGuild, { node: target.identifier, nodeSelection: { backend: 'nodelink' } })), { code: 'NO_ELIGIBLE_NODE' });
  target.connected = false;
  assert.throws(() => manager.players.restore(stored(firstGuild, { node: target.identifier })), { code: 'NO_ELIGIBLE_NODE' });
  assert.equal(manager.players.size, 0);
});

test('a reconstructed server session stays on its confirmed node without issuing a play request', async t => {
  const { manager, nodes: [source, target] } = pool(t);
  await manager.database.set(`players.${firstGuild}`, stored(firstGuild));
  let updates = 0;
  let resumed = 0;
  for (const node of [source, target]) node.rest.updatePlayer = async () => { updates++; return {}; };
  target.rest.getPlayers = async () => [remote(firstGuild)];
  manager.on('playerResumed', () => resumed++);
  await target._resumePlayers();
  const player = manager.players.get(firstGuild);
  assert.ok(player);
  assert.equal(player.node, target);
  assert.equal(player.current.position, 42000);
  assert.equal(player.paused, false);
  assert.equal(player.isResuming, false);
  assert.equal(resumed, 1);
  assert.equal(updates, 0);
});

test('stored ownership of another node prevents a stale server session from reclaiming the guild', async t => {
  const { manager, nodes: [source, target] } = pool(t);
  await manager.database.set(`players.${firstGuild}`, stored(firstGuild, { node: target.identifier }));
  source.rest.getPlayers = async () => [remote(firstGuild)];
  await source._resumePlayers();
  assert.equal(manager.players.has(firstGuild), false);
  assert.equal((await manager.database.get(`players.${firstGuild}`)).node, target.identifier);
});

test('duplicate session synchronization reads and announces the same players once', async t => {
  const { manager, nodes: [source], create } = pool(t);
  const player = create();
  player.current = createTrack('current');
  const response = deferred();
  let reads = 0;
  let announcements = 0;
  source.rest.getPlayers = () => { reads++; return response.promise; };
  manager.on('playerResumed', () => announcements++);
  const first = source._resumePlayers();
  const duplicate = source._resumePlayers();
  response.resolve([remote(firstGuild, { track: player.current.toJSON() })]);
  await Promise.all([first, duplicate]);
  assert.equal(reads, 1);
  assert.equal(announcements, 1);
});

for (const change of ['session', 'socket', 'destroy']) {
  test(`a pending session response is ignored after its node changes ${change}`, async t => {
    const { manager, nodes: [source], create } = pool(t);
    const player = create();
    player.current = createTrack('current');
    player.current.position = 123;
    player.paused = true;
    player.playing = false;
    const response = deferred();
    let announcements = 0;
    source.rest.getPlayers = () => response.promise;
    manager.on('playerResumed', () => announcements++);
    const resuming = source._resumePlayers();
    if (change === 'session') source.sessionId = 'new-session';
    if (change === 'socket') source.socket = { close() {} };
    if (change === 'destroy') await source.destroy();
    response.resolve([remote(firstGuild)]);
    await resuming;
    assert.equal(player.current.position, 123);
    assert.equal(player.paused, true);
    assert.equal(player.playing, false);
    assert.equal(announcements, 0);
  });
}

test('stop issued during the session fetch cannot be overwritten by the older server state', async t => {
  const { manager, nodes: [source], create } = pool(t);
  const player = create();
  player.current = createTrack('current');
  player.playing = true;
  const response = deferred();
  let announcements = 0;
  source.rest.getPlayers = () => response.promise;
  manager.on('playerResumed', () => announcements++);
  const resuming = source._resumePlayers();
  await player.stop();
  response.resolve([remote(firstGuild)]);
  await resuming;
  assert.equal(player.current, null);
  assert.equal(player.playing, false);
  assert.equal(announcements, 0);
});

test('destroy issued during the session fetch cannot resurrect a stored player', async t => {
  const { manager, nodes: [source], create } = pool(t);
  const player = create();
  await manager.database.set(`players.${firstGuild}`, stored(firstGuild));
  const response = deferred();
  source.rest.getPlayers = () => response.promise;
  const resuming = source._resumePlayers();
  await player.destroy('test deletion');
  response.resolve([remote(firstGuild)]);
  await resuming;
  assert.equal(manager.players.has(firstGuild), false);
  assert.equal(await manager.database.has(`players.${firstGuild}`), false);
});

for (const destroy of [false, true]) {
  test(`a user-created guild during storage lookup wins over stale recovery, destroyed=${destroy}`, async t => {
    const { manager, nodes: [source], create } = pool(t);
    const saved = stored(firstGuild);
    await manager.database.set(`players.${firstGuild}`, saved);
    const started = deferred();
    const response = deferred();
    const get = manager.database.get.bind(manager.database);
    manager.database.get = async key => {
      if (key === `players.${firstGuild}`) { started.resolve(); return response.promise; }
      return get(key);
    };
    source.rest.getPlayers = async () => [remote(firstGuild)];
    const resuming = source._resumePlayers();
    await started.promise;
    const userPlayer = create();
    userPlayer.current = createTrack('user-selection');
    userPlayer.current.position = 123;
    userPlayer.paused = true;
    if (destroy) await userPlayer.destroy('test deletion');
    response.resolve(saved);
    await resuming;
    if (destroy) assert.equal(manager.players.has(firstGuild), false);
    else {
      assert.equal(manager.players.get(firstGuild), userPlayer);
      assert.equal(userPlayer.current.identifier, 'user-selection');
      assert.equal(userPlayer.current.position, 123);
      assert.equal(userPlayer.paused, true);
    }
  });
}

test('one malformed stored guild does not reject synchronization of a following valid session', async t => {
  const { manager, nodes: [source] } = pool(t);
  await manager.database.set(`players.${firstGuild}`, stored(firstGuild, { voiceChannelId: 'invalid-channel' }));
  await manager.database.set(`players.${secondGuild}`, stored(secondGuild));
  source.rest.getPlayers = async () => [remote(firstGuild), remote(secondGuild)];
  const failures = [];
  manager.on('nodeError', (_node, error) => failures.push(error));
  await assert.doesNotReject(source._resumePlayers());
  assert.equal(manager.players.has(firstGuild), false);
  assert.equal(manager.players.get(secondGuild).node, source);
  assert.equal(failures.length, 1);
});

test('a failed reconstructed voice connection does not leave isResuming set or block the next guild', async t => {
  const { manager, nodes: [source] } = pool(t);
  await manager.database.set(`players.${firstGuild}`, stored(firstGuild));
  await manager.database.set(`players.${secondGuild}`, stored(secondGuild));
  source.rest.getPlayers = async () => [remote(firstGuild), remote(secondGuild)];
  const resumed = [];
  const failures = [];
  manager.on('nodeError', (_node, error) => failures.push(error));
  manager.on('playerResumed', player => resumed.push(player.guildId));
  manager.on('playerCreate', player => {
    if (player.guildId === firstGuild) player.voice.connect = async () => { throw new Error('test voice rejection'); };
  });
  await assert.doesNotReject(source._resumePlayers());
  assert.equal(manager.players.get(firstGuild).isResuming, false);
  assert.equal(manager.players.get(secondGuild).isResuming, false);
  assert.deepEqual(resumed, [secondGuild]);
  assert.equal(failures.length, 1);
});
