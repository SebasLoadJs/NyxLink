const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { Rest } = require('../dist');
const { createPlayer } = require('./helpers/player.cjs');

test('a real HTTP 404 rejects the player update and schedules session recovery once', async t => {
  const { node, player } = createPlayer(t);
  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests++;
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'Session expired' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  node.port = server.address().port;
  node.secure = false;
  node.sessionId = 'expired-session';
  let recoveries = 0;
  player.softRestart = async () => { recoveries++; return true; };
  const rest = new Rest(node);
  await assert.rejects(rest.updatePlayer(player.guildId, { paused: true }), /status 404/);
  assert.equal(requests, 1);
  assert.equal(recoveries, 1);
});

for (const status of [204, 404, 503]) {
  test(`bounded cleanup handles HTTP ${status} in one request`, async t => {
    const { node, player } = createPlayer(t);
    let requests = 0;
    const server = http.createServer((req, res) => {
      requests++;
      assert.equal(req.method, 'DELETE');
      res.writeHead(status);
      res.end();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());
    node.port = server.address().port;
    node.sessionId = 'fixture-session';
    const rest = new Rest(node);
    const cleanup = rest.destroyPlayer(player.guildId, { timeoutMs: 1000 });
    if (status === 503) await assert.rejects(cleanup, /status 503/);
    else await cleanup;
    assert.equal(requests, 1);
  });
}

test('bounded cleanup rejects an invalid budget before issuing a request', async t => {
  const { node, player } = createPlayer(t);
  const rest = new Rest(node);
  for (const timeoutMs of [0, -1, Infinity, NaN, 60001]) {
    await assert.rejects(rest.destroyPlayer(player.guildId, { timeoutMs }), TypeError);
  }
});

test('REST player routes reject invalid session or guild identifiers before transport', async t => {
  const { node, player } = createPlayer(t);
  const rest = new Rest(node);
  for (const session of ['', '..', 'other/players', 'session?query', 'session%2fpath', 'x\r\ny']) {
    node.sessionId = session;
    await assert.rejects(rest.getPlayers(), TypeError);
    await assert.rejects(rest.getPlayer(player.guildId), TypeError);
    await assert.rejects(rest.updatePlayer(player.guildId, { paused: true }), TypeError);
    await assert.rejects(rest.destroyPlayer(player.guildId), TypeError);
    await assert.rejects(rest.updateSession(true, 60), TypeError);
  }
  node.sessionId = 'fixture-session';
  for (const guild of ['..', '123?other', 'guild/other']) {
    await assert.rejects(rest.getPlayer(guild), TypeError);
    await assert.rejects(rest.updatePlayer(guild, {}), TypeError);
    await assert.rejects(rest.destroyPlayer(guild), TypeError);
  }
});

test('a delayed player ownership check cannot send an update to a replacement session', async t => {
  const { node, player, manager } = createPlayer(t);
  const { deferred } = require('./helpers/player.cjs');
  const entered = deferred(), release = deferred();
  node.sessionId = 'old-session';
  const rest = new Rest(node);
  const oldOwnership = manager.guildOwnership;
  manager.guildOwnership = { async assertCurrent() { entered.resolve(); await release.promise; } };
  try {
    const request = rest.updatePlayer(player.guildId, { paused: true });
    const rejected = assert.rejects(request, /session changed/);
    await entered.promise;
    node.sessionId = 'new-session';
    release.resolve();
    await rejected;
  } finally { manager.guildOwnership = oldOwnership; }
});


test('Lavalink metrics uses native endpoint and repeated metric filters', async t => {
  const { node } = createPlayer(t);
  node.rest.getInfoWithHeaders = async () => ({ data: { version: { semver: '4.2.2' }, sourceManagers: [], filters: [] }, headers: {} });
  await node.open();
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('jvm_memory_used_bytes 42\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  node.port = server.address().port;
  node.secure = false;
  const rest = new Rest(node);
  assert.equal(await rest.getLavalinkMetrics(['jvm_memory_used_bytes', 'process_cpu_seconds_total']), 'jvm_memory_used_bytes 42\n');
  const url = new URL(requests[0], 'http://localhost');
  assert.equal(url.pathname, '/metrics');
  assert.deepEqual(url.searchParams.getAll('name[]'), ['jvm_memory_used_bytes', 'process_cpu_seconds_total']);
  await assert.rejects(rest.getLavalinkMetrics(['bad name']), TypeError);
  assert.equal(requests.length, 1);
  node.backend = undefined;
  await assert.rejects(rest.getLavalinkMetrics());
  assert.equal(requests.length, 1);
});
