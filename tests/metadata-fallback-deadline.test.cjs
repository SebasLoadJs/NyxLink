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
