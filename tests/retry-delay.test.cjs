const test = require('node:test');
const assert = require('node:assert/strict');
const { retryDelay, retryJitter } = require('../dist/src/nodes/RetryDelay.js');

test('failover retry delay doubles on each consecutive failure', () => {
  const base = 250;
  assert.deepEqual(
    [0, 1, 2, 3].map(attempt => retryDelay(base, attempt, 0, 60000)),
    [250, 500, 1000, 2000]
  );
});

test('retry delay respects maximum budget and jitter never lengthens delay', () => {
  assert.equal(retryDelay(30000, 5, 0, 60000), 60000);
  assert.equal(retryDelay(200, 0, 0, 60000), 200);
  const jittered = retryDelay(5000, 2, 1, 60000);
  assert.ok(jittered >= 0 && jittered <= 20000);
});

test('retry jitter rejects invalid values', () => {
  for (const value of [-0.1, 1.1, Infinity, NaN, '0.5']) {
    assert.throws(() => retryJitter(value), /retryJitter/);
  }
});
