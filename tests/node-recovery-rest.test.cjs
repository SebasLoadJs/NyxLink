const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { Node, NodeState, Rest, BackendDetector } = require('../dist');
const { createPlayer, deferred } = require('./helpers/player.cjs');

async function fixture(t, handler, options = {}) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { manager } = createPlayer(t);
  manager.options.node = { circuitBreaker: { failureThreshold: 2, cooldownMs: 100, ...options } };
  const node = new Node(manager, { identifier: 'protected', host: '127.0.0.1', port: server.address().port, password: 'test', secure: false });
  node.connected = true;
  node.state = NodeState.READY;
  node.sessionId = 'test-session';
  manager.nodes.nodes.set(node.identifier, node);
  t.after(async () => {
    await node.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { server, node, manager, rest: new Rest(node) };
}

test('HTTP player failures open the circuit and subsequent updates fail without another request', async t => {
  let requests = 0;
  const { rest, node } = await fixture(t, (_req, res) => {
    requests++;
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end('{"message":"Unavailable"}');
  });
  const guild = '323456789012345678';
  await assert.rejects(rest.updatePlayer(guild, { volume: 50 }), { statusCode: 503 });
  await assert.rejects(rest.updatePlayer(guild, { volume: 50 }), { statusCode: 503 });
  await assert.rejects(rest.updatePlayer(guild, { volume: 50 }), { code: 'CIRCUIT_OPEN' });
  assert.equal(requests, 2);
  assert.equal(node.circuit.state, 'open');
});

test('one real stats probe recovers a circuit and concurrent probes do not fan out', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const started = deferred();
  const release = deferred();
  let statsRequests = 0;
  const stats = { players: 0, cpu: { systemLoad: 0.1 }, memory: { used: 10, allocated: 100 } };
  const { rest, node } = await fixture(t, (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v4/stats') {
      statsRequests++;
      started.resolve();
      void release.promise.then(() => res.end(JSON.stringify(stats)));
    } else {
      res.writeHead(503);
      res.end('{}');
    }
  }, { failureThreshold: 1 });
  t.after(() => release.resolve());
  await assert.rejects(rest.updatePlayer('323456789012345678', {}), { statusCode: 503 });
  assert.equal(node.circuit.state, 'open');
  assert.equal(await node.probe(), false);
  assert.equal(statsRequests, 0);
  t.mock.timers.tick(100);
  const probing = node.probe();
  await started.promise;
  assert.equal(node.circuit.state, 'half-open');
  assert.equal(await node.probe(), false);
  assert.equal(statsRequests, 1);
  release.resolve();
  assert.equal(await probing, true);
  assert.equal(node.circuit.state, 'closed');
  assert.deepEqual(node.stats, stats);
});

test('source errors and HTTP 404s never blacklist an otherwise reachable node', async t => {
  let status = 200;
  let requests = 0;
  const { rest, node } = await fixture(t, (_req, res) => {
    requests++;
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(status === 200 ? { loadType: 'error', data: { message: 'Track not found' } } : { message: 'Missing route' }));
  }, { failureThreshold: 1 });
  assert.equal((await rest.loadTracks('invalid-track')).loadType, 'error');
  status = 404;
  await assert.rejects(rest.loadTracks('invalid-track'), { statusCode: 404 });
  assert.equal(node.circuit.state, 'closed');
  assert.equal(requests, 2);
});

test('transport error codes survive the HTTP wrapper and trip the configured node circuit', async t => {
  const { server, rest, node } = await fixture(t, (_req, res) => res.end('{}'), { failureThreshold: 1 });
  await new Promise(resolve => server.close(resolve));
  await assert.rejects(rest.updatePlayer('323456789012345678', {}), { code: 'ECONNREFUSED' });
  assert.equal(node.circuit.state, 'open');
  await assert.rejects(rest.updatePlayer('323456789012345678', {}), { code: 'CIRCUIT_OPEN' });
});

test('an unsupported optional endpoint does not open the node circuit', async t => {
  const { node, rest } = await fixture(t, (_req, res) => {
    res.writeHead(501, { 'content-type': 'application/json' });
    res.end('{"message":"Feature disabled"}');
  }, { failureThreshold: 1 });
  node.backend = BackendDetector.detect({ isNodelink: true, version: { semver: '3.10.0' } });
  node.isNodeLink = true;
  await assert.rejects(rest.getMixLayers('323456789012345678'), { code: 'FEATURE_UNAVAILABLE' });
  assert.equal(node.circuit.state, 'closed');
  assert.equal(node.backend.featureStatus('mix:list'), 'unavailable');
});
