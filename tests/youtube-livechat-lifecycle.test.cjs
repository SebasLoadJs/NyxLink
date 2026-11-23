const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPlayer } = require('./helpers/player.cjs');
const { YouTubeLiveChat } = require('../dist');

function fixture(t, options = {}) {
  const { manager, node } = createPlayer(t);
  node.isNodeLink = true;
  manager.clientId = '123456789012345678';
  const transport = require('../dist/src/services/WebSocket.js');
  const previous = transport.WebSocket;
  const sockets = [];
  class FakeSocket extends EventEmitter {
    constructor(url, config) {
      super();
      this.url = url;
      this.config = config;
      this.closeCalls = 0;
      sockets.push(this);
    }
    close(code = 1000, reason = 'closed') {
      this.closeCalls++;
      this.emit('close', { code, reason });
    }
  }
  transport.WebSocket = FakeSocket;
  t.after(() => { transport.WebSocket = previous; });
  const chat = new YouTubeLiveChat(node, 'test id/slash', options);
  t.after(() => chat.close());
  return { manager, node, chat, sockets };
}
const tick = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms));

test('live chat manual close cancels a scheduled reconnect after network drop', async t => {
  const { chat, sockets } = fixture(t, { reconnectDelay: 5, maxReconnectAttempts: 2 });
  chat.connect();
  assert.equal(sockets.length, 1);
  sockets[0].emit('close', { code: 1006, reason: 'transport lost' });
  chat.close();
  await tick();
  assert.equal(sockets.length, 1, 'manual close must cancel the old reconnect timer');
});

test('live chat ignores stale messages and close events after reconnection', async t => {
  const { chat, sockets } = fixture(t, { reconnectDelay: 5 });
  const messages = [];
  chat.on('message', value => messages.push(value.content));
  chat.connect();
  sockets[0].emit('close', { code: 1006, reason: 'network loss' });
  await tick();
  assert.equal(sockets.length, 2);
  sockets[0].emit('message', { data: JSON.stringify({ type: 'message', content: 'stale' }) });
  sockets[0].emit('close', { code: 1006, reason: 'duplicate close' });
  sockets[1].emit('message', { data: JSON.stringify({ type: 'message', content: 'current' }) });
  assert.deepEqual(messages, ['current']);
  assert.equal(sockets.length, 2);
});

test('live chat manual connect is idempotent while a socket is current', t => {
  const { chat, sockets } = fixture(t, { reconnectDelay: 0 });
  chat.connect();
  chat.connect();
  assert.equal(sockets.length, 1);
  assert.match(sockets[0].url, /test%20id%2Fslash$/);
  chat.close();
  assert.equal(sockets[0].closeCalls, 1);
});

test('live chat limits reconnect attempts until a new open resets the budget', async t => {
  const { chat, sockets } = fixture(t, { reconnectDelay: 5, maxReconnectAttempts: 1 });
  const errors = [];
  chat.on('error', error => errors.push(error.message));
  chat.connect();
  sockets[0].emit('close', { code: 1006, reason: 'first failure' });
  await tick();
  assert.equal(sockets.length, 2);
  sockets[1].emit('close', { code: 1006, reason: 'second failure' });
  await tick();
  assert.equal(sockets.length, 2);
  assert.deepEqual(errors, ['YouTube live chat max reconnect attempts reached.']);
});

test('live chat validation rejects invalid reconnection policy and missing client ID', t => {
  const { manager, node } = fixture(t);
  for (const [identifier, options] of [
    ['', {}],
    ['valid', { autoReconnect: 'yes' }],
    ['valid', { reconnectDelay: -1 }],
    ['valid', { reconnectDelay: Number.NaN }],
    ['valid', { maxReconnectAttempts: 100 }],
    ['valid', { maxReconnectAttempts: 1.5 }],
  ]) {
    assert.throws(() => new YouTubeLiveChat(node, identifier, options), TypeError);
  }
  manager.clientId = '';
  assert.throws(() => new YouTubeLiveChat(node, 'valid').connect(), /clientId/);
});

test('invalid JSON does not leak provider content into parse diagnostics', t => {
  const { chat, sockets } = fixture(t);
  const errors = [];
  chat.on('error', error => errors.push(error.message));
  chat.connect();
  sockets[0].emit('message', { data: '{ "token": "secret-example", missing' });
  assert.deepEqual(errors, ['YouTube live chat parse error: invalid JSON payload']);
  assert.doesNotMatch(errors[0], /secret-example/);
});
