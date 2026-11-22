const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { Rest, Player } = require('../dist');
const { playbackGuard } = require('../dist/src/players/PlaybackGuard');
const { createPlayer, deferred } = require('./helpers/player.cjs');

async function fixture(t, handler = (_req,res) => { res.writeHead(404); res.end(); }) {
  const ctx = createPlayer(t);
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server,'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  ctx.node.port = server.address().port;
  ctx.node.sessionId = 'test-session';
  return {...ctx, rest:new Rest(ctx.node)};
}

test('404 recovery deduplicates each player without blocking other guilds', async t => {
  const {manager,node,player,rest} = await fixture(t);
  const other = new Player(manager,node,{guildId:'323456789012345678',voiceChannelId:player.voiceChannelId});
  other.stopHealthCheck();
  manager.players.players.set(other.guildId,other);
  const pending = deferred();
  const started = [];
  for (const p of [player,other]) p.softRestart = () => { started.push(p.guildId); return pending.promise; };
  try {
    await Promise.all([player,player,other].map(p => assert.rejects(rest.updatePlayer(p.guildId,{volume:10}),{statusCode:404})));
    assert.deepEqual(started.sort(), [player.guildId,other.guildId].sort());
  } finally { pending.resolve(true); }
});

test('late 404 from old playback intent does not start recovery', async t => {
  const arrived = deferred();
  const response = deferred();
  const {player,rest} = await fixture(t, async (_req,res) => {
    arrived.resolve(); await response.promise; res.writeHead(404); res.end();
  });
  let recoveries = 0;
  player.softRestart = async () => { recoveries++; return true; };
  const failed = assert.rejects(rest.updatePlayer(player.guildId,{position:10}),{statusCode:404});
  await arrived.promise;
  playbackGuard(player).invalidate();
  response.resolve();
  await failed;
  assert.equal(recoveries,0);
});

test('rejected stale recovery cannot destroy a player after a newer intent', async t => {
  const {player,rest} = await fixture(t);
  const pending = deferred();
  player.softRestart = () => pending.promise;
  let destructions = 0;
  player.destroy = async () => { destructions++; };
  const recovering = rest.triggerPlayerRecovery(player);
  playbackGuard(player).invalidate();
  pending.reject(new Error('old recovery failed'));
  await recovering;
  assert.equal(destructions,0);
});
