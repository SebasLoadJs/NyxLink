const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { HttpError, NodeCircuitBreaker, Node, NodeState } = require('../dist');
const { createPlayer } = require('./helpers/player.cjs');

test('Retry-After preserves integer seconds and valid HTTP dates as a delay', t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(1994, 10, 6, 8, 49, 30) });
  for (const [header, expected] of [
    ['120', 120000], ['0', 0], [' 2 ', 2000],
    ['Sun, 06 Nov 1994 08:49:37 GMT', 7000],
    ['Sunday, 06-Nov-94 08:49:37 GMT', 7000],
    ['Sun Nov  6 08:49:37 1994', 7000],
    ['Sun, 06 Nov 1994 08:49:00 GMT', 0],
  ]) assert.equal(new HttpError(503, undefined, header).retryAfterMs, expected, header);
});

test('invalid Retry-After values do not become a date or an infinite retry delay', () => {
  for (const header of [undefined, null, [], '-1', '1.5', 'Infinity', 'NaN', '', 'tomorrow', '9999999999999999999999999999']) {
    assert.equal(new HttpError(503, undefined, header).retryAfterMs, undefined, String(header));
  }
});

for (const status of [429, 503]) {
  test(`HTTP ${status} with Retry-After opens before the usual threshold and preserves the server delay`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1000 });
    const circuit = new NodeCircuitBreaker({ failureThreshold: 10, cooldownMs: 100 });
    const error = new HttpError(status, undefined, '5');
    await assert.rejects(circuit.run(async () => { throw error; }), candidate => candidate === error);
    assert.equal(circuit.state, 'open');
    assert.equal(circuit.retryAt, 6000);
    t.mock.timers.tick(4999);
    let requests = 0;
    await assert.rejects(circuit.run(async () => { requests++; }), { code: 'CIRCUIT_OPEN' });
    assert.equal(requests, 0);
    t.mock.timers.tick(1);
    assert.equal(await circuit.run(async () => 'recovered'), 'recovered');
    assert.equal(circuit.state, 'closed');
  });
}

test('Retry-After cannot shorten local cooldown or turn a client error into a node outage', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const circuit = new NodeCircuitBreaker({ failureThreshold: 1, cooldownMs: 5000 });
  await assert.rejects(circuit.run(async () => { throw new HttpError(404, undefined, '60'); }));
  assert.equal(circuit.state, 'closed');
  await assert.rejects(circuit.run(async () => { throw new HttpError(429, undefined, '1'); }));
  assert.equal(circuit.retryAt, 6000);
});

test('a real HTTP Retry-After header reaches the error and suppresses further player requests', async t => {
  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests++;
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '2' });
    res.end('{"message":"Rate limited"}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { manager } = createPlayer(t);
  manager.options.node = { circuitBreaker: { failureThreshold: 10, cooldownMs: 100 } };
  const node = new Node(manager, { identifier: 'limited', host: '127.0.0.1', port: server.address().port, password: 'test', secure: false });
  node.connected = true;
  node.state = NodeState.READY;
  t.after(async () => {
    await node.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const started = Date.now();
  await assert.rejects(node.rest.updatePlayer('323456789012345678', {}), error => {
    assert.equal(error.statusCode, 429);
    assert.equal(error.retryAfterMs, 2000);
    return true;
  });
  assert.ok(node.circuit.retryAt >= started + 2000);
  await assert.rejects(node.rest.updatePlayer('323456789012345678', {}), { code: 'CIRCUIT_OPEN' });
  assert.equal(requests, 1);
});
