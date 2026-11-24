const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureImage } = require('./helpers/backend-lab.cjs');

const image = 'example.invalid/backend@sha256:' + 'a'.repeat(64);

test('backend lab reuses a locally available pinned image', async () => {
  const calls = [];
  await ensureImage(async (...args) => { calls.push(args); }, image);
  assert.deepEqual(calls, [[['image', 'inspect', image]]]);
});

test('backend lab gives a cold immutable download its own timeout', async () => {
  const calls = [];
  await ensureImage(async (...args) => {
    calls.push(args);
    if (args[0][0] === 'image') throw new Error('not found');
  }, image);
  assert.deepEqual(calls, [[['image', 'inspect', image]], [['pull', image], 600000]]);
});

test('backend lab never pulls a missing locally built patched image', async () => {
  const calls = [];
  await assert.rejects(ensureImage(async (...args) => {
    calls.push(args);
    throw new Error('not found');
  }, 'patched:local', true), /Required locally built image is unavailable/);
  assert.deepEqual(calls, [[['image', 'inspect', 'patched:local']]]);
});

test('backend lab propagates download failure instead of using another image', async () => {
  const calls = [];
  await assert.rejects(ensureImage(async (...args) => {
    calls.push(args);
    throw new Error(args[0][0] === 'image' ? 'not found' : 'registry unavailable');
  }, image), /registry unavailable/);
  assert.equal(calls.length, 2);
});
