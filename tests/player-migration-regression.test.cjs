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
