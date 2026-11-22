const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, NodeState } = require('../dist');
const { createPlayer, createTrack } = require('./helpers/player.cjs');

function migration(t) {
  const context = createPlayer(t);
  const { manager, player } = context;
  const target = new Node(manager, { identifier: 'start-target', host: '127.0.0.1', port: 2450, password: 'test', secure: false });
  target.connected = true;
  target.state = NodeState.READY;
  target.rest.destroyPlayer = async () => {};
  manager.nodes.nodes.set(target.identifier, target);
  player.voice.connect = async () => {};
  player.current = createTrack('restored-current');
  player.current.position = 45000;
  player.playing = true;
  player.paused = true;
  player.volume = 62;
  t.after(async () => { await target.destroy(); await manager.database.shutdown(); });
  return { ...context, target };
}

function startTrack(player, payload) {
  return { ...player.current.toJSON(), userData: structuredClone(payload.track.userData) };
}

for (const timing of ['before', 'after']) {
  test(`the first destination start ${timing} the restore acknowledgement preserves requested pause and position`, async t => {
    const { manager, player, target } = migration(t);
    let wire;
    target.rest.updatePlayer = async (_guild, payload) => {
      if (payload.track?.encoded) {
        wire = startTrack(player, payload);
        if (timing === 'before') await target.handleTrackStart(player, { track: wire });
      }
      return payload;
    };
    assert.equal(await player.transferNode(target), true);
    if (timing === 'after') await target.handleTrackStart(player, { track: wire });
    assert.equal(player.node, target);
    assert.equal(player.current.position, 45000);
    assert.equal(player.paused, true);
    const stored = await manager.database.get(`players.${player.guildId}.current`);
    assert.equal(stored.info.position, 45000);
  });
}

test('a destination position update following its start is retained when the migration commits', async t => {
  const { manager, player, target } = migration(t);
  target.rest.updatePlayer = async (_guild, payload) => {
    if (payload.track?.encoded) {
      await target.handleTrackStart(player, { track: startTrack(player, payload) });
      await target.message({ data: JSON.stringify({ op: 'playerUpdate', guildId: player.guildId,
        state: { position: 45555, time: Date.now(), connected: true, ping: 3 } }) });
    }
    return payload;
  };
  assert.equal(await player.transferNode(target), true);
  assert.equal(player.current.position, 45555);
  assert.equal(player.paused, true);
  const stored = await manager.database.get(`players.${player.guildId}.current`);
  assert.equal(stored.info.position, 45555);
});

test('resume acknowledged after migration is preserved by a delayed destination start', async t => {
  const { player, target } = migration(t);
  let wire;
  target.rest.updatePlayer = async (_guild, payload) => {
    if (payload.track?.encoded) wire = startTrack(player, payload);
    return payload;
  };
  assert.equal(await player.transferNode(target), true);
  await player.resume();
  assert.equal(player.paused, false);
  await target.handleTrackStart(player, { track: wire });
  assert.equal(player.paused, false);
  assert.equal(player.current.position, 45000);
});

test('seek acknowledged after migration is preserved by a delayed destination start', async t => {
  const { player, target } = migration(t);
  let wire;
  target.rest.updatePlayer = async (_guild, payload) => {
    if (payload.track?.encoded) wire = startTrack(player, payload);
    return payload;
  };
  assert.equal(await player.transferNode(target), true);
  await player.seek(47000);
  assert.equal(player.current.position, 47000);
  await target.handleTrackStart(player, { track: wire });
  assert.equal(player.current.position, 47000);
  assert.equal(player.paused, true);
});

test('a throwing switched-node listener cannot prevent cleanup of the committed origin', async t => {
  const { manager, node: source, player, target } = migration(t);
  let sourceCleanup = 0;
  source.rest.destroyPlayer = async () => { sourceCleanup++; };
  target.rest.updatePlayer = async (_guild, payload) => payload;
  manager.on('playerSwitchedNode', () => { throw new Error('observer rejected notification'); });
  const result = await player.transferNode(target).catch(error => {
    assert.match(error.message, /observer rejected notification/);
    return 'listener-error';
  });
  assert.notEqual(result, false);
  assert.equal(sourceCleanup, 1);
  assert.equal(player.node, target);
  assert.equal(await manager.database.get(`players.${player.guildId}.node`), target.identifier);
});


test('migration restores the captured position rather than a stale higher position', async t => {
  const {player,target} = migration(t);
  player.set('lastKnownPosition', 150000);
  let position;
  target.rest.updatePlayer = async (_guild,payload) => {
    if (payload.track?.encoded) position=payload.position;
    return payload;
  };
  assert.equal(await player.transferNode(target),true);
  assert.equal(position,45000);
});

test('a failed ownership commit must not announce a resumed player', async t => {
  const {manager,player,target}=migration(t);
  target.rest.updatePlayer=async (_guild,payload)=>payload;
  const set=manager.database.set.bind(manager.database);
  manager.database.set=async (key,value)=>{
    if(key.endsWith('.node') && value===target.identifier) throw new Error('ownership rejected');
    return set(key,value);
  };
  let resumed=0;
  manager.on('playerResumed',()=>resumed++);
  assert.equal(await player.transferNode(target),false);
  assert.equal(resumed,0);
});

test('a migration resume event observes committed ownership', async t => {
  const {manager,player,target}=migration(t);
  target.rest.updatePlayer=async (_guild,payload)=>payload;
  const owners=[];
  manager.on('playerResumed',()=>owners.push(manager.database.get(`players.${player.guildId}.node`)));
  assert.equal(await player.transferNode(target),true);
  assert.deepEqual(await Promise.all(owners),[target.identifier]);
});
