const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError, NodeCircuitBreaker } = require('../dist');
const { deferred } = require('./helpers/player.cjs');

test('a later concurrent response extends an open circuit to the larger server wait', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const circuit = new NodeCircuitBreaker({ failureThreshold: 1, cooldownMs: 100 });
  const later = deferred();
  const pending = circuit.run(() => later.promise);
  await assert.rejects(circuit.run(async () => { throw new HttpError(429, undefined, '2'); }));
  assert.equal(circuit.retryAt, 3000);
  t.mock.timers.tick(1000);
  later.reject(new HttpError(503, undefined, '10'));
  await assert.rejects(pending);
  assert.equal(circuit.state, 'open');
  assert.equal(circuit.retryAt, 12000);
  t.mock.timers.tick(9999);
  await assert.rejects(circuit.run(async () => 'too early'), { code: 'CIRCUIT_OPEN' });
  t.mock.timers.tick(1);
  assert.equal(await circuit.run(async () => 'recovered'), 'recovered');
});

test('an old response cannot reopen a circuit after a successful newer probe', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const circuit = new NodeCircuitBreaker({ failureThreshold: 1, cooldownMs: 100 });
  const later = deferred();
  const pending = circuit.run(() => later.promise);
  await assert.rejects(circuit.run(async () => { throw new HttpError(429, undefined, '1'); }));
  t.mock.timers.tick(1000);
  assert.equal(await circuit.run(async () => 'recovered'), 'recovered');
  later.reject(new HttpError(503, undefined, '60'));
  await assert.rejects(pending);
  assert.equal(circuit.state, 'closed');
  assert.equal(circuit.retryAt, 0);
});
