const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket } = require('../dist/src/services/WebSocket');

async function server(t, handler) {
  const instance = http.createServer(handler);
  instance.listen(0, '127.0.0.1');
  await once(instance, 'listening');
  t.after(() => { instance.closeAllConnections(); return new Promise(resolve => instance.close(resolve)); });
  return 'ws://127.0.0.1:' + instance.address().port;
}

function connect(t, url) {
  const ws = new WebSocket(url, { headers: { Authorization: 'private-test-credential', 'Session-Id': 'test-session' } });
  const errors = [];
  ws.on('error', error => errors.push(error));
  const closed = new Promise(resolve => ws.once('close', resolve));
  t.after(() => ws.close());
  return {ws, errors, closed};
}

test('cross-origin WebSocket redirects never forward node credentials', {timeout: 5000}, async t => {
  let requests = 0;
  const target = await server(t, (_req, res) => { requests++; res.end(); });
  const origin = await server(t, (_req, res) => { res.writeHead(302, {location: target + '/websocket'}); res.end(); });
  const { closed, errors } = connect(t, origin + '/websocket');
  assert.equal((await closed).code, 1006);
  assert.match(errors[0].error.message, /origin/);
  assert.equal(requests, 0);
});

test('same-origin WebSocket redirects retain credentials and close once on rejection', {timeout: 5000}, async t => {
  const received = [];
  const origin = await server(t, (req, res) => {
    received.push({ path: req.url, authorization: req.headers.authorization });
    if (req.url === '/first') res.writeHead(302, {location: '/second'});
    else res.writeHead(401);
    res.end();
  });
  const { ws, closed } = connect(t, origin + '/first');
  let closes = 0; ws.on('close', () => closes++);
  assert.equal((await closed).code, 1008);
  assert.deepEqual(received, [{ path:'/first', authorization:'private-test-credential' }, { path:'/second', authorization:'private-test-credential' }]);
  ws.close();
  assert.equal(closes, 1);
});

test('a failed TLS connection cannot retry with insecure WebSocket', {timeout: 5000}, async t => {
  let requests = 0;
  const origin = await server(t, (_req, res) => { requests++; res.writeHead(401); res.end(); });
  const { closed } = connect(t, origin.replace('ws:', 'wss:').replace('127.0.0.1', 'localhost') + '/websocket');
  assert.equal((await closed).code, 1006);
  assert.equal(requests, 0);
});

function fake(t) {
  t.mock.method(WebSocket.prototype, 'connectNode', function () {
    this.connected = true;
    this.netSocket = { write() {}, destroy() {} };
  });
  const ws = new WebSocket('ws://127.0.0.1:2333');
  ws.on('error', () => {});
  t.after(() => ws.close());
  return ws;
}

test('oversized frames are rejected before waiting for their body', t => {
  const ws = fake(t);
  let close; ws.on('close', event => close = event);
  const header = Buffer.alloc(10);
  header[0] = 0x82; header[1] = 127; header.writeBigUInt64BE(100_000_000n, 2);
  ws.handleData(header);
  assert.equal(close.code, 1009);
  assert.equal(ws.buffer.length, 0);
});

test('fragmented messages have an aggregate size limit', t => {
  const ws = fake(t);
  ws.MAX_MESSAGE_BYTES = 10;
  let close; ws.on('close', event => close = event);
  ws.handleFrame(2, false, Buffer.alloc(6));
  ws.handleFrame(0, true, Buffer.alloc(5));
  assert.equal(close.code, 1009);
  assert.equal(ws.fragmentedPayload.length, 0);
});

test('close listeners observe already released transport resources', t => {
  const ws = fake(t);
  let destroyed = false;
  ws.netSocket.destroy = () => { destroyed = true; };
  ws.on('close', () => {
    assert.equal(destroyed, true);
    assert.equal(ws.netSocket, null);
    assert.equal(ws.socket, null);
  });
  ws.close();
});
