const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { BackendDetector } = require('../dist');
const { createPlayer, createTrack, deferred } = require('./helpers/player.cjs');
const { playbackGuard } = require('../dist/src/players/PlaybackGuard');

function enable(node) {
  node.isNodeLink = true;
  node.backend = BackendDetector.detect({ version: { semver: '3.10.0' }, isNodelink: true });
  node.sessionId = 'mix-session';
}

test('mix requests and responses use verified envelopes and 0..1 volume via real HTTP', async t => {
  const { node, player } = createPlayer(t); enable(node);
  const track = JSON.parse(JSON.stringify(createTrack('overlay').toJSON()));
  const created = { id: 'mix-1', track, volume: 0.25 };
  let response = created;
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    calls.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : undefined });
    if (req.method === 'PATCH' || req.method === 'DELETE') { res.writeHead(204); res.end(); return; }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(response));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  node.port = server.address().port;
  assert.deepEqual(await player.addMix(track.encoded, { volume: 0.25 }), created);
  assert.equal(calls[0].body.volume, 0.25);
  response = { mixes: [{ ...created, position: 25, startTime: Date.now() }] };
  assert.equal((await player.getMixes()).mixes[0].position, 25);
  assert.equal(await player.updateMixVolume('mix-1', 0.5), player);
  assert.equal(await player.removeMix('mix-1'), player);
  const before = calls.length;
  for (const volume of [-1, 2, NaN, Infinity]) {
    await assert.rejects(player.addMix(track.encoded, { volume }), TypeError);
    await assert.rejects(player.updateMixVolume('mix-1', volume), TypeError);
  }
  await assert.rejects(player.removeMix('../invalid'), TypeError);
  assert.equal(calls.length, before);
  response = { mixes: [{ ...created, position: -1, startTime: 0 }] };
  node.backend = BackendDetector.detect({ version: { semver: '3.10.0' }, isNodelink: true });
  await assert.rejects(player.getMixes(), { code: 'INVALID_PROTOCOL_RESPONSE' });
  assert.equal(node.backend.featureStatus('mix:list'), 'unknown', 'malformed response does not certify support');
  response = { ...created, track: { encoded: 'broken' } };
  await assert.rejects(player.addMix(track.encoded), { code: 'INVALID_PROTOCOL_RESPONSE' });
});

test('concurrent mix writes are serialized and a failed operation does not poison later commands', async t => {
  const { node, player } = createPlayer(t); enable(node);
  const entered = deferred(), release = deferred(), calls = [];
  node.rest.updateMixLayerVolume = async () => { calls.push('update'); entered.resolve(); await release.promise; throw new Error('backend rejection'); };
  node.rest.removeMixLayer = async () => { calls.push('remove'); };
  const first = player.updateMixVolume('mix-1', 0.5);
  const rejected = assert.rejects(first, /backend rejection/);
  await entered.promise;
  const second = player.removeMix('mix-1');
  await Promise.resolve(); assert.deepEqual(calls, ['update']);
  release.resolve(); await rejected; await second;
  assert.deepEqual(calls, ['update', 'remove']);
});

test('queued mix commands are cancelled when a new playback intent supersedes them', async t => {
  const { node, player } = createPlayer(t); enable(node);
  const entered = deferred(), release = deferred(); let removed = 0;
  node.rest.updateMixLayerVolume = async () => { entered.resolve(); await release.promise; };
  node.rest.removeMixLayer = async () => { removed++; };
  const first = player.updateMixVolume('mix-1', 0.5); const firstRejected = assert.rejects(first, { code: 'PLAYER_OPERATION_CANCELLED' });
  await entered.promise;
  const second = player.removeMix('mix-1'); const secondRejected = assert.rejects(second, { code: 'PLAYER_OPERATION_CANCELLED' });
  playbackGuard(player).invalidate(); release.resolve();
  await Promise.all([firstRejected, secondRejected]);
  assert.equal(removed, 0);
});

test('late mix responses cannot be returned as current state after session replacement', async t => {
  const { node, player } = createPlayer(t); enable(node);
  const entered = deferred(), release = deferred();
  node.rest.getMixLayers = async () => { entered.resolve(); await release.promise; return { mixes: [] }; };
  const pending = player.getMixes(); const rejected = assert.rejects(pending, { code: 'PLAYER_OPERATION_CANCELLED' });
  await entered.promise; node.sessionId = 'replacement-session'; release.resolve(); await rejected;
});

test('Lavalink mix operations reject before making any HTTP request', async t => {
  const { player } = createPlayer(t);
  await assert.rejects(player.addMix('opaque'), { code: 'FEATURE_UNAVAILABLE' });
  await assert.rejects(player.getMixes(), { code: 'FEATURE_UNAVAILABLE' });
});
