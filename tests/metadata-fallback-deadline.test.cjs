const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveMetadata } = require('../dist/src/tracks/MetadataTrackResolver.js');
const { createPlayer, createTrack } = require('./helpers/player.cjs');

test('metadata fallback shares a finite deadline across candidate sources', async t => {
  const { node } = createPlayer(t);
  const original = createTrack('metadata-deadline');
  let calls = 0;
  node.rest.loadTracks = async (_identifier, { signal, timeoutMs }) => {
    calls++;
    assert.ok(timeoutMs > 0 && timeoutMs <= 150);
    return new Promise((_resolve, reject) => {
      const cancel = () => reject(signal.reason);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
  };
  await assert.rejects(
    resolveMetadata(original, node, { sources: ['youtube', 'soundcloud'], timeoutMs: 150 }),
    /timed out/i,
  );
  assert.equal(calls, 1, 'deadline aborts the first pending HTTP request rather than running every source');
});

test('metadata fallback reduces per-request budget after earlier empty results', async t => {
  const { node } = createPlayer(t);
  const original = createTrack('metadata-fallback');
  const outbound = [];
  const encoded = original.toJSON();
  node.rest.loadTracks = async (identifier, options) => {
    outbound.push({ identifier, timeoutMs: options.timeoutMs, signal: options.signal });
    if (identifier.startsWith('ytsearch:')) {
      await new Promise(resolve => setTimeout(resolve, 20));
      return { loadType: 'empty', data: {} };
    }
    return { loadType: 'search', data: [{ ...encoded, encoded: 'destination-match' }] };
  };
  const matched = await resolveMetadata(original, node, {
    sources: ['youtube', 'soundcloud'], timeoutMs: 2000,
  });
  assert.equal(matched.encoded, 'destination-match');
  assert.deepEqual(outbound.map(request => request.identifier.split(':')[0]), ['ytsearch', 'scsearch']);
  assert.ok(outbound[1].timeoutMs < outbound[0].timeoutMs);
  assert.equal(outbound[0].signal, outbound[1].signal, 'all source attempts use the same abort signal');
});

test('metadata fallback rejects invalid cumulative time budgets before making requests', async t => {
  const { node } = createPlayer(t);
  const original = createTrack('metadata-validation');
  let calls = 0;
  node.rest.loadTracks = async () => { calls++; return { loadType: 'empty', data: {} }; };
  for (const timeoutMs of [0, -1, 1.5, Infinity, 60001]) {
    await assert.rejects(resolveMetadata(original, node, {
      sources: ['youtube'], timeoutMs,
    }), /Invalid metadata track resolution options/);
  }
  assert.equal(calls, 0);
});

test('metadata fallback stops all source attempts when its caller cancels playback', async t => {
  const { node } = createPlayer(t);
  const original = createTrack('metadata-intent-cancelled');
  const caller = new AbortController();
  let resolveEntered;
  const entered = new Promise(resolve => { resolveEntered = resolve; });
  let calls = 0;
  node.rest.loadTracks = async (_identifier, { signal }) => {
    calls++;
    resolveEntered();
    return new Promise((_resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  };
  const pending = resolveMetadata(original, node, {
    sources: ['youtube', 'soundcloud'], timeoutMs: 10000,
  }, caller.signal);
  await entered;
  const rejected = assert.rejects(pending, /superseded intent/);
  caller.abort(new Error('superseded intent'));
  await rejected;
  assert.equal(calls, 1, 'cancelled request must not try another provider');
});

test('metadata deadline settles even when a custom REST adapter never honors abort', async t => {
  const { node } = createPlayer(t);
  let requests = 0;
  node.rest.loadTracks = async () => {
    requests++;
    return new Promise(() => {});
  };
  const started = Date.now();
  await assert.rejects(resolveMetadata(createTrack('ignores-abort'), node, {
    sources: ['youtube', 'soundcloud'], timeoutMs: 75,
  }), /timed out/i);
  assert.equal(requests, 1, 'a timed-out request must not start a second backend lookup');
  assert.ok(Date.now() - started < 1500, 'the caller must not wait for an unresponsive adapter');
});

test('metadata deadline consumes a late rejecting transport result', async t => {
  const { node } = createPlayer(t);
  let rejectLate;
  node.rest.loadTracks = async () => new Promise((_resolve, reject) => {
    rejectLate = reject;
  });
  await assert.rejects(resolveMetadata(createTrack('late-failure'), node, {
    sources: ['youtube'], timeoutMs: 75,
  }), /timed out/i);
  rejectLate(new Error('delayed failure after deadline'));
  await new Promise(resolve => setImmediate(resolve));
});
