const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError, NodeCircuitBreaker } = require('../dist');
const { deferred } = require('./helpers/player.cjs');

test('a concurrent server wait supersedes an in-flight probe without admitting another probe', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const circuit = new NodeCircuitBreaker({ failureThreshold: 1, cooldownMs: 100 });
  const late = deferred();
  const olderRequest = circuit.run(() => late.promise);
  await assert.rejects(circuit.run(async () => { throw new HttpError(429, undefined, '1'); }));
  t.mock.timers.tick(1000);
  const response = deferred();
  const probe = circuit.run(() => response.promise);
  assert.equal(circuit.state, 'half-open');
  late.reject(new HttpError(503, undefined, '10'));
  await assert.rejects(olderRequest);
  assert.equal(circuit.state, 'open');
  assert.equal(circuit.retryAt, 12000);
  t.mock.timers.tick(10000);
  let extraRequests = 0;
  await assert.rejects(circuit.run(async () => { extraRequests++; }), { code: 'CIRCUIT_OPEN' });
  assert.equal(extraRequests, 0);
  response.resolve('outdated probe');
  assert.equal(await probe, 'outdated probe');
  assert.equal(circuit.state, 'open');
  assert.equal(await circuit.run(async () => 'new probe'), 'new probe');
  assert.equal(circuit.state, 'closed');
});
