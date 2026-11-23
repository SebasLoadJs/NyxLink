const test = require('node:test');
const assert = require('node:assert/strict');
const { Node } = require('../dist');
const { NodeState } = require('../dist/src/typings/types.js');
const { createPlayer, createTrack } = require('./helpers/player.cjs');

function attachDestination(t, manager) {
  const config = {
    identifier: 'migration-destination', host: '127.0.0.1',
    port: 2444, password: 'test-only',
  };
  const node = new Node(manager, config);
  node.connected = true;
  node.state = NodeState.READY;
  manager.nodes.nodes.set(node.identifier, node);
  t.after(async () => { await node.destroy(); });
  return node;
}

test('migration keeps the source when target playback restoration fails', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const target = attachDestination(t, manager);
  const current = createTrack('migration-rollback');
  current.position = 32000;
  player.current = current;
  player.playing = true;
  player.paused = false;
  let targetCleanups = 0;
  let sourceCleanups = 0;
  target.rest.destroyPlayer = async () => { targetCleanups++; };
  source.rest.destroyPlayer = async () => { sourceCleanups++; };
  player.restart = async () => false;

  assert.equal(await player.transferNode(target), false);
  assert.equal(player.node, source);
  assert.equal(player.current, current);
  assert.equal(player.current.position, 32000);
  assert.equal(player.playing, true);
  assert.equal(player.paused, false);
  assert.equal(targetCleanups, 1);
  assert.equal(sourceCleanups, 0);
  const saved = await manager.database.get(`players.${player.guildId}`);
  assert.equal(saved.node, source.identifier);
  assert.equal(saved.current.encoded, current.encoded);
});

test('migration commits target ownership only after successful restoration', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const target = attachDestination(t, manager);
  let sourceCleanups = 0;
  let targetCleanups = 0;
  source.rest.destroyPlayer = async () => { sourceCleanups++; };
  target.rest.destroyPlayer = async () => { targetCleanups++; };
  player.restart = async () => true;

  assert.equal(await player.transferNode(target), true);
  assert.equal(player.node, target);
  assert.equal(sourceCleanups, 1);
  assert.equal(targetCleanups, 0);
  const saved = await manager.database.get(`players.${player.guildId}`);
  assert.equal(saved.node, target.identifier);
});

test('migration rollback preserves source when target ownership persistence fails', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const target = attachDestination(t, manager);
  const set = manager.database.set.bind(manager.database);
  let injected = false;
  manager.database.set = async (key, value) => {
    if (!injected && key === `players.${player.guildId}.node` && value === target.identifier) {
      injected = true;
      throw new Error('simulated storage failure');
    }
    return set(key, value);
  };
  player.restart = async () => true;
  let targetCleanups = 0;
  target.rest.destroyPlayer = async () => { targetCleanups++; };
  source.rest.destroyPlayer = async () => { throw new Error('source must remain alive'); };

  assert.equal(await player.transferNode(target), false);
  assert.equal(injected, true);
  assert.equal(player.node, source);
  assert.equal(targetCleanups, 1);
  const saved = await manager.database.get(`players.${player.guildId}`);
  assert.equal(saved.node, source.identifier);
});

test('successful migration retains target when source cleanup fails', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const target = attachDestination(t, manager);
  player.restart = async () => true;
  const errors = [];
  const statuses = [];
  manager.on('nodeError', (node, error) => errors.push({ node, error }));
  manager.on('playerNodeFailover', (_player, status) => statuses.push(status));
  source.rest.destroyPlayer = async () => { throw new Error('source cleanup unavailable'); };
  let targetCleanups = 0;
  target.rest.destroyPlayer = async () => { targetCleanups++; };

  assert.equal(await player.transferNode(target), true);
  assert.equal(player.node, target);
  assert.equal(targetCleanups, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].node, source);
  assert.equal(statuses.at(-1).status, 'recovered');
  assert.match(statuses.at(-1).reason, /source cleanup unavailable/);
  const saved = await manager.database.get(`players.${player.guildId}`);
  assert.equal(saved.node, target.identifier);
});

test('stop during in-flight migration cancels target commit and stops original player', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const target = attachDestination(t, manager);
  const current = createTrack('migration-stopped');
  player.current = current;
  player.playing = true;

  let signalEntered;
  let signalRelease;
  const entered = new Promise(resolve => { signalEntered = resolve; });
  const released = new Promise(resolve => { signalRelease = resolve; });
  let targetCleanups = 0;
  target.rest.destroyPlayer = async () => { targetCleanups++; };
  player.restart = async () => {
    signalEntered();
    await released;
    return true;
  };

  const migrating = player.transferNode(target);
  await entered;
  const stopping = player.stop();
  signalRelease();
  assert.equal(await migrating, false);
  await stopping;

  assert.equal(player.node, source);
  assert.equal(player.current, null);
  assert.equal(player.playing, false);
  assert.equal(targetCleanups, 1);
  const saved = await manager.database.get(`players.${player.guildId}`);
  assert.equal(saved.node, source.identifier);
  assert.equal(saved.current, null);
});

test('explicit play during in-flight migration rolls back target before replacing track', async t => {
  const { manager, node: source, player, requests } = createPlayer(t);
  const target = attachDestination(t, manager);
  const original = createTrack('migration-before-new-play');
  const replacement = createTrack('migration-user-replacement');
  player.current = original;
  player.playing = true;
  let targetCleanups = 0;
  target.rest.destroyPlayer = async () => { targetCleanups++; };
  let signalEntered;
  let signalRelease;
  const entered = new Promise(resolve => { signalEntered = resolve; });
  const released = new Promise(resolve => { signalRelease = resolve; });
  player.restart = async () => {
    signalEntered();
    await released;
    return true;
  };

  const migrating = player.transferNode(target);
  await entered;
  const playing = player.play({ track: replacement });
  signalRelease();
  assert.equal(await migrating, false);
  assert.equal(await playing, true);
  assert.equal(player.node, source);
  assert.equal(player.current, replacement);
  assert.equal(targetCleanups, 1);
  assert.equal(requests.at(-1).payload.track.encoded, replacement.encoded);
  const saved = await manager.database.get(`players.${player.guildId}`);
  assert.equal(saved.node, source.identifier);
  assert.equal(saved.current.encoded, replacement.encoded);
});

test('rollback cleans destination exactly once even when nodeError observer throws', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const target = attachDestination(t, manager);
  const original = createTrack('listener-throws-on-cleanup');
  player.current = original;
  player.playing = true;
  player.restart = async () => false;

  let targetCleanups = 0;
  let sourceCleanups = 0;
  let observedErrors = 0;
  target.rest.destroyPlayer = async () => {
    targetCleanups++;
    throw new Error('destination cleanup failed');
  };
  source.rest.destroyPlayer = async () => { sourceCleanups++; };
  manager.on('nodeError', () => {
    observedErrors++;
    throw new Error('subscriber callback threw');
  });

  const statuses = [];
  manager.on('playerNodeFailover', (_player, status) => statuses.push(status.status));

  assert.equal(await player.transferNode(target), false);
  assert.equal(targetCleanups, 1, 'rollback must not repeat destructive REST requests');
  assert.equal(sourceCleanups, 0, 'source session remains owned by original node');
  assert.equal(observedErrors, 1);
  assert.equal(player.node, source);
  assert.equal(player.current, original);
  assert.equal(player.playing, true);
  assert.deepEqual(statuses, ['in-progress', 'failed']);
});

test('rollback still cleans target if best-effort persistence diagnostics throw', async t => {
  const { manager, node: source, player } = createPlayer(t);
  const target = attachDestination(t, manager);
  player.restart = async () => false;
  const originalUpdateData = player.updateData.bind(player);
  player.updateData = async (key, value) => {
    if (key === 'queue') throw new Error('simulated rollback persistence failure');
    return originalUpdateData(key, value);
  };
  manager.on('debug', message => {
    if (message.includes('Migration rollback storage failed')) {
      throw new Error('diagnostic listener failed');
    }
  });
  let targetCleanups = 0;
  target.rest.destroyPlayer = async () => { targetCleanups++; };

  assert.equal(await player.transferNode(target), false);
  assert.equal(player.node, source);
  assert.equal(targetCleanups, 1);
});
