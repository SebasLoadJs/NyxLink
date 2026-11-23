const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlayer } = require('./helpers/player.cjs');

const TOKEN = 'nyxlink-metrics-test-token-with-32-characters';

async function open(t) {
  const { manager, node, player } = createPlayer(t);
  const endpoint = await manager.startPrivateMetricsServer({ token: TOKEN });
  t.after(async () => endpoint.close());
  const get = (path, options = {}) => fetch(endpoint.url + path, {
    ...options,
    headers: { Authorization: 'Bearer ' + TOKEN, ...options.headers },
  });
  return { manager, node, player, endpoint, get };
}

test('private metrics are opt-in, loopback-only and require a strong token', async t => {
  const { manager } = createPlayer(t);
  for (const opts of [
    {}, { token: 'short' }, { token: TOKEN, host: '0.0.0.0' },
    { token: TOKEN, host: 'localhost' }, { token: TOKEN, port: -1 },
    { token: TOKEN, port: 65536 }, { token: TOKEN, port: 1.2 },
  ]) {
    await assert.rejects(manager.startPrivateMetricsServer(opts), /token|loopback|port/i);
  }
  const endpoint = await manager.startPrivateMetricsServer({ token: TOKEN, port: 0 });
  t.after(async () => endpoint.close());
  assert.match(endpoint.url, /^http:\/\/127\.0\.0\.1:\d+$/);
});

test('private endpoints reject unauthenticated, invalid and non-GET requests', async t => {
  const { endpoint, get } = await open(t);
  const noAuth = await fetch(endpoint.url + '/health');
  assert.equal(noAuth.status, 401);
  assert.equal(noAuth.headers.get('cache-control'), 'no-store');
  assert.equal(noAuth.headers.get('x-content-type-options'), 'nosniff');
  assert.match(noAuth.headers.get('www-authenticate'), /^Bearer/);
  const wrong = await fetch(endpoint.url + '/nodes', {
    headers: { Authorization: 'Bearer ' + TOKEN + '-wrong' },
  });
  assert.equal(wrong.status, 401);
  const post = await get('/metrics', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET');
  assert.equal((await get('/unknown')).status, 404);
  assert.equal((await get('/metrics?token=untrusted')).status, 404);
});

test('private JSON and Prometheus output contain only aggregates and opaque node keys', async t => {
  const { node, player, get } = await open(t);
  node.sessionId = 'session-secret-7284';
  node.password = 'backend-secret-7284';
  node.identifier = 'node-secret-hostname';
  player.voice.token = 'voice-secret-7284';
  player.playing = true;
  const health = await get('/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { healthy: true });

  const nodes = await (await get('/nodes')).json();
  assert.equal(nodes.nodes.length, 1);
  assert.match(nodes.nodes[0].key, /^[0-9a-f]{16}$/);
  assert.equal(nodes.nodes[0].players, 1);
  assert.equal(nodes.nodes[0].playingPlayers, 1);
  assert.equal(nodes.nodes[0].ready, true);
  const summary = await (await get('/players/summary')).json();
  assert.deepEqual(summary, { total: 1, playing: 1, paused: 0 });

  const metrics = await (await get('/metrics')).text();
  assert.match(metrics, /nyxlink_nodes_ready 1/);
  assert.match(metrics, /nyxlink_players_playing 1/);
  assert.match(metrics, /# TYPE nyxlink_players_total gauge/);
  const versions = await (await get('/versions')).json();
  assert.equal(typeof versions.nyxlink, 'string');
  assert.deepEqual(versions.nodes, []);

  const combined = JSON.stringify({ nodes, summary, versions }) + metrics;
  for (const secret of [
    'backend-secret-7284', 'session-secret-7284', 'voice-secret-7284',
    'node-secret-hostname', player.guildId, player.voiceChannelId,
    player.voice.sessionId,
  ]) {
    assert.equal(combined.includes(secret), false, 'sensitive value leaked');
  }
});

test('Manager shutdown closes every opt-in metrics listener', async t => {
  const { manager } = createPlayer(t);
  const a = await manager.startPrivateMetricsServer({ token: TOKEN });
  const b = await manager.startPrivateMetricsServer({ token: TOKEN });
  const urlA = a.url, urlB = b.url;
  assert.equal((await fetch(urlA + '/health', {
    headers: { Authorization: 'Bearer ' + TOKEN },
  })).status, 200);
  await manager.shutdown();
  await a.close();
  await b.close();
  await assert.rejects(fetch(urlA + '/health'), /fetch failed/i);
  await assert.rejects(fetch(urlB + '/health'), /fetch failed/i);
  await assert.rejects(manager.startPrivateMetricsServer({ token: TOKEN }), /shut down/);
});

test('concurrent start and close cannot leave an orphaned listener', async t => {
  const { manager } = createPlayer(t);
  const { PrivateMetricsServer } = require('../dist');
  const endpoint = new PrivateMetricsServer(manager, { token: TOKEN });
  const first = endpoint.listen();
  const second = endpoint.listen();
  const closing = endpoint.close();
  const results = await Promise.allSettled([first, second, closing]);
  assert.equal(results[2].status, 'fulfilled');
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'fulfilled');
  assert.throws(() => endpoint.url, /not listening/);
  await assert.rejects(endpoint.listen(), /closed/);
});

test('version inventory includes backend release only when safely formatted', async t => {
  const { node, get } = await open(t);
  node.backend = { kind: 'nodelink', version: '3.10.0-dev.2026-11-15.8' };
  const data = await (await get('/versions')).json();
  assert.equal(data.nodes.length, 1);
  assert.equal(data.nodes[0].backend, 'nodelink');
  assert.equal(data.nodes[0].version, '3.10.0-dev.2026-11-15.8');
  assert.match(data.nodes[0].key, /^[0-9a-f]{16}$/);
  node.backend = { kind: 'nodelink', version: '3.10.0 password=not-for-logs' };
  const invalid = await (await get('/versions')).json();
  assert.equal(invalid.nodes[0].version, null);
  assert.doesNotMatch(JSON.stringify(invalid), /not-for-logs/);
});
