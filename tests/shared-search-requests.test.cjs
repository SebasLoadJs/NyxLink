const test = require('node:test');
const assert = require('node:assert/strict');
const { SharedSearchRequests } = require('../dist/src/search/SharedSearchRequests.js');

test('shared searches isolate subscriber cancellation without cancelling another caller', async () => {
  const requests = new SharedSearchRequests();
  let finishLoad;
  const backend = new Promise(resolve => { finishLoad = resolve; });
  let activeSignal, calls = 0;
  const load = signal => { calls++; activeSignal = signal; return backend; };
  const first = new AbortController();
  const second = new AbortController();
  const cancelled = requests.run('same-key', first.signal, load);
  const surviving = requests.run('same-key', second.signal, load);
  const rejected = assert.rejects(cancelled, /first caller cancelled/);
  await new Promise(resolve => setImmediate(resolve));
  first.abort(new Error('first caller cancelled'));
  await rejected;
  assert.equal(calls, 1);
  assert.equal(activeSignal.aborted, false);
  finishLoad({ value: 42 });
  assert.deepEqual(await surviving, { value: 42 });
  requests.close();
});

test('closing shared requests rejects pending subscribers even with a non-cooperative backend', async () => {
  const requests = new SharedSearchRequests();
  let activeSignal;
  const load = signal => {
    activeSignal = signal;
    return new Promise(() => {});
  };
  const caller = new AbortController();
  const pending = requests.run('never-finishes', caller.signal, load);
  const rejected = assert.rejects(pending, /shut down/i);
  await new Promise(resolve => setImmediate(resolve));
  requests.close();
  await rejected;
  assert.equal(activeSignal.aborted, true);
});

test('shared backend rejection reaches all subscribers and subsequent calls can retry', async () => {
  const requests = new SharedSearchRequests();
  let rejectBackend;
  const backend = new Promise((_resolve, reject) => { rejectBackend = reject; });
  let calls = 0;
  const load = () => { calls++; return backend; };
  const a = requests.run('failed', new AbortController().signal, load);
  const b = requests.run('failed', new AbortController().signal, load);
  const checkA = assert.rejects(a, /HTTP 429/);
  const checkB = assert.rejects(b, /HTTP 429/);
  await new Promise(resolve => setImmediate(resolve));
  rejectBackend(new Error('HTTP 429'));
  await Promise.all([checkA, checkB]);
  assert.equal(calls, 1);
  assert.equal(await requests.run('failed', new AbortController().signal, async () => 'retried'), 'retried');
  requests.close();
});

test('aborting every subscriber releases the shared key without waiting for transport cleanup', async () => {
  const requests = new SharedSearchRequests();
  let calls = 0, firstSignal;
  const load = signal => {
    calls++;
    if (calls === 1) {
      firstSignal = signal;
      return new Promise(() => {});
    }
    return Promise.resolve('replacement response');
  };
  const a = new AbortController(), b = new AbortController();
  const first = requests.run('reusable', a.signal, load);
  const second = requests.run('reusable', b.signal, load);
  const firstRejected = assert.rejects(first, /stop a/);
  const secondRejected = assert.rejects(second, /stop b/);
  await new Promise(resolve => setImmediate(resolve));
  a.abort(new Error('stop a'));
  b.abort(new Error('stop b'));
  await Promise.all([firstRejected, secondRejected]);
  assert.equal(firstSignal.aborted, true);
  assert.equal(await requests.run('reusable', new AbortController().signal, load), 'replacement response');
  assert.equal(calls, 2);
  requests.close();
});
