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

test('metadata matching prefers identical ISRC and rejects an explicit conflicting recording', async t => {
  const { node } = createPlayer(t);
  const seed = createTrack('isrc-matching');
  seed.isrc = 'USAAA1234567';
  const original = seed.toJSON();
  const conflicting = {
    ...original, encoded: 'wrong-recording', info: { ...original.info, isrc: 'GBBBB7654321' },
  };
  const matching = {
    ...original, encoded: 'correct-recording', info: { ...original.info, isrc: 'us-aaa-1234567' },
  };
  node.rest.loadTracks = async () => ({ loadType: 'search', data: [conflicting, matching] });
  const result = await resolveMetadata(seed, node, { sources: ['youtube'], minimumScore: 0.8 });
  assert.equal(result.encoded, 'correct-recording', 'matching titles must not override a different known ISRC');

  node.rest.loadTracks = async () => ({ loadType: 'search', data: [conflicting] });
  assert.equal(await resolveMetadata(seed, node, { sources: ['youtube'] }), undefined);
});

test('metadata provider errors and authorization failures do not bypass source policy', async t => {
  const { node } = createPlayer(t);
  const original = createTrack('blocked-provider');
  let calls = 0;
  node.rest.loadTracks = async () => {
    calls++;
    return { loadType: 'error', data: { message: 'HTTP 429: exhausted quota' } };
  };
  await assert.rejects(resolveMetadata(original, node, {
    sources: ['youtube', 'soundcloud'],
  }), /Metadata source rejected/i);
  assert.equal(calls, 1, 'the alternate metadata source must never bypass a provider error');
  node.rest.loadTracks = async () => {
    calls++;
    throw new Error('HTTP 401');
  };
  await assert.rejects(resolveMetadata(original, node, {
    sources: ['youtube', 'soundcloud'],
  }), /HTTP 401/);
  assert.equal(calls, 2, 'a rejected auth request must not lead to another provider');
});

test('accent-insensitive metadata matching avoids a different live version and duration', async t => {
  const { node } = createPlayer(t);
  const original = createTrack('accent-search');
  original.title = 'Canción Única';
  original.author = 'José García';
  const base = original.toJSON();
  const matching = {
    ...base, encoded: 'studio-match',
    info: { ...base.info, title: 'Cancion Unica', author: 'Jose Garcia' },
  };
  const different = {
    ...base, encoded: 'different-live-version',
    info: { ...base.info, title: 'Cancion Unica (Live)', length: base.info.length + 40000 },
  };
  node.rest.loadTracks = async () => ({ loadType: 'search', data: [different, matching] });
  const result = await resolveMetadata(original, node, { sources: ['youtube'], durationToleranceMs: 10000 });
  assert.equal(result.encoded, 'studio-match');
  node.rest.loadTracks = async () => ({ loadType: 'search', data: [different] });
  assert.equal(await resolveMetadata(original, node, { sources: ['youtube'] }), undefined);
});

test('metadata fallback never queries disabled providers or accepts their tracks', async t => {
  const { manager, node } = createPlayer(t);
  const original = createTrack('disabled-source');
  manager.options.sources.disabledSources = ['youtube'];
  const incoming = original.toJSON();
  const calls = [];
  node.rest.loadTracks = async identifier => {
    calls.push(identifier);
    return { loadType: 'track', data: {
      ...incoming, encoded: 'soundcloud-match',
      info: { ...incoming.info, sourceName: 'soundcloud' },
    } };
  };
  const matching = await resolveMetadata(original, node, { sources: ['youtube', 'soundcloud'] });
  assert.equal(matching.encoded, 'soundcloud-match');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^scsearch:/);

  node.rest.loadTracks = async () => ({ loadType: 'track', data: {
    ...incoming, encoded: 'disabled-track',
    info: { ...incoming.info, sourceName: 'youtube' },
  } });
  const blocked = await resolveMetadata(original, node, { sources: ['soundcloud'] });
  assert.equal(blocked, undefined, 'result source must be checked, not only query prefix');

  manager.options.sources.disabledSources = ['youtube', 'soundcloud'];
  let forbiddenCalls = 0;
  node.rest.loadTracks = async () => { forbiddenCalls++; throw new Error('never called'); };
  assert.equal(await resolveMetadata(original, node, { sources: ['youtube', 'soundcloud'] }), undefined);
  assert.equal(forbiddenCalls, 0);
});
