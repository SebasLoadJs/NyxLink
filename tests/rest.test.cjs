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
