const test = require('node:test');
const assert = require('node:assert/strict');
const { stringifyWithReplacer } = require('../dist/src/Util.js');

test('diagnostic serialization redacts nested credential fields without mutating data', () => {
  const payload = { Authorization: 'node-password-sentinel', voice: { token: 'voice-token-sentinel', session_id: 'session-sentinel' }, config: { clientSecret: 'secret-sentinel' }, userData: { anything: 'private-user-data' }, visible: 42n };
  payload.self = payload;
  const log = stringifyWithReplacer(payload);
  for (const secret of ['node-password-sentinel', 'voice-token-sentinel', 'session-sentinel', 'secret-sentinel', 'private-user-data']) assert.ok(!log.includes(secret));
  assert.equal(JSON.parse(log).visible, '42');
  assert.equal(JSON.parse(log).self, '[Circular Refs]');
  assert.equal(payload.voice.token, 'voice-token-sentinel');
});
