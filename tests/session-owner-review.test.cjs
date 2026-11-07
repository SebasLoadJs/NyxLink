const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, NodeState } = require('../dist');
const { createPlayer, createTrack } = require('./helpers/player.cjs');

test('a successful migration commits the persisted owner used for future session restoration', async t => {
  const { manager, node: source, player } = createPlayer(t);
  await manager.database.set(`players.${player.guildId}.node`, source.identifier);
  const target = new Node(manager, { identifier: 'destination', host: '127.0.0.1', port: 2444, password: 'test', secure: false });
  target.connected = true;
  target.state = NodeState.READY;
  target.rest.destroyPlayer = async () => {};
  target.rest.updatePlayer = async (_guild, payload) => payload;
  manager.nodes.nodes.set(target.identifier, target);
  t.after(async () => { await target.destroy(); await manager.database.shutdown(); });
  player.voice.connect = async () => {};
  player.current = createTrack('migrated-track');
  assert.equal(await player.transferNode(target), true);
  assert.equal(player.node, target);
  assert.equal(await manager.database.get(`players.${player.guildId}.node`), target.identifier);
});

test('an empty confirmed server session cannot mark an empty local player as playing', async t => {
  const { node, player } = createPlayer(t);
  player.current = null;
  player.playing = false;
  player.paused = false;
  node.rest.getPlayers = async () => [{
    guildId: player.guildId, track: null, volume: 100, paused: false,
    state: { position: 0, connected: true, time: Date.now(), ping: 1 },
    filters: {}, voice: { token: 'test-token', endpoint: 'test.invalid', sessionId: 'test-session' },
  }];
  await node._resumePlayers();
  assert.equal(player.current, null);
  assert.equal(player.playing, false);
});
