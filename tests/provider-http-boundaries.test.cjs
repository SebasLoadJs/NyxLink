const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { Manager, Node, NodeState, SpotifySource, DeezerSource, HttpPolicyError } = require('../dist');
const { makeRequest } = require('../dist/src/Util');
const { DatabaseManager } = require('../dist/src/managers/DatabaseManager');
const { deferred } = require('./helpers/player.cjs');

async function server(t, handle) {
  const received = [];
  const active = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const entry = { path: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() };
    received.push(entry);
    await handle(entry, res);
  });
  active.listen(0, '127.0.0.1');
  await once(active, 'listening');
  t.after(async () => { active.closeAllConnections(); await new Promise(resolve => active.close(resolve)); });
  return { origin: `http://127.0.0.1:${active.address().port}`, port: active.address().port, received };
}
function json(res, value) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); }
function redirect(res, location, status = 302) { res.writeHead(status, { location }); res.end(); }
function policy(error) {
  return typeof HttpPolicyError === 'function' && error instanceof HttpPolicyError && error.code === 'HTTP_POLICY_REJECTED' && typeof error.reason === 'string';
}

// All mocked provider requests, including forbidden destinations, terminate on our own server.
// Never allow the fixture to use DNS or sockets for a provider or attacker host.
async function providers(t, handle) {
  const lab = await server(t, handle);
  const original = http.request;
  const budgets = [];
  const route = (input, options, callback) => {
    let requestOptions;
    if (typeof input === 'string' || input instanceof URL) {
      const target = new URL(input);
      if (typeof options === 'function') { callback = options; options = {}; }
      requestOptions = { ...options, hostname: target.hostname, path: target.pathname + target.search };
    } else { requestOptions = input; callback = options; }
    const upstream = requestOptions.hostname ?? requestOptions.host;
    const request = original({ ...requestOptions, hostname: '127.0.0.1', host: undefined, port: lab.port, protocol: 'http:', agent: undefined,
      headers: { ...requestOptions.headers, 'x-fixture-upstream-host': upstream } }, callback);
    const setTimeout = request.setTimeout;
    request.setTimeout = function (timeout, ...args) { budgets.push(timeout); return setTimeout.call(this, timeout, ...args); };
    return request;
  };
  t.mock.method(https, 'request', route);
  t.mock.method(http, 'request', route);
  return { ...lab, budgets };
}
function spotify(options = {}) { return new SpotifySource({ options: { spotify: { accessToken: 'fixture-access-token', ...options } }, emit() {} }); }
function deezer() { return new DeezerSource({ options: { deezer: {} }, emit() {} }); }
function upstream(entry) { return entry.headers['x-fixture-upstream-host']; }

function searching(t, options = {}) {
  const manager = new Manager({ nodes: [{ host: '127.0.0.1', port: 2333, password: 'fixture' }], options: { database: { type: 'memory' }, search: options } });
  manager.database = new DatabaseManager(manager);
  const node = new Node(manager, { identifier: 'search-node', host: '127.0.0.1', port: 2333, password: 'fixture' });
  node.connected = true; node.state = NodeState.READY;
  manager.nodes.nodes.set(node.identifier, node);
  node.rest.loadTracks = async () => ({ loadType: 'empty', data: {} });
  t.after(() => manager.shutdown());
  return { manager, node };
}
function record() { return { encoded: 'opaque', info: { identifier: 'track', title: 'Song', author: 'Artist', length: 1000,
  uri: 'https://fixture.invalid/track', sourceName: 'http', position: 0, isStream: false, isSeekable: true }, pluginInfo: {}, userData: {} }; }
async function outcome(operation, milliseconds = 180) {
  const observed = operation.then(value => ({ value }), error => ({ error }));
  let timer;
  try { return await Promise.race([observed, new Promise(resolve => { timer = setTimeout(() => resolve({ pending: true }), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

test('same-origin relative redirects preserve authorization and caller headers', async t => {
  const lab = await server(t, (req, res) => req.path === '/initial' ? redirect(res, '/final') : json(res, req.headers));
  const headers = { Authorization: 'fixture-auth', Cookie: 'fixture-cookie', 'X-Request-Id': 'fixture' };
  const result = await makeRequest(`${lab.origin}/initial`, { headers }, 1000, 0);
  assert.equal(result.authorization, 'fixture-auth');
  assert.equal(result.cookie, 'fixture-cookie');
  assert.deepEqual(headers, { Authorization: 'fixture-auth', Cookie: 'fixture-cookie', 'X-Request-Id': 'fixture' });
});

test('cross-origin GET redirects strip sensitive headers case-insensitively without changing caller options', async t => {
  const destination = await server(t, (req, res) => json(res, req.headers));
  const source = await server(t, (_req, res) => redirect(res, `${destination.origin}/collect`));
  const headers = { AuThOrIzAtIoN: 'fixture-auth', 'pRoXy-AuThOrIzAtIoN': 'fixture-proxy', COOKIE: 'fixture-cookie', CoOkIe2: 'fixture-cookie2', 'X-Request-Id': 'fixture' };
  const before = { ...headers };
  const result = await makeRequest(`${source.origin}/start`, { headers }, 1000, 0);
  for (const name of ['authorization', 'proxy-authorization', 'cookie', 'cookie2']) assert.equal(result[name], undefined);
  assert.equal(result['x-request-id'], 'fixture');
  assert.deepEqual(headers, before);
});

test('redirecting back to the initial origin does not reattach stripped credentials', async t => {
  let source;
  const destination = await server(t, (_req, res) => redirect(res, `${source.origin}/final`));
  source = await server(t, (req, res) => req.path === '/final' ? json(res, req.headers) : redirect(res, `${destination.origin}/middle`));
  const result = await makeRequest(`${source.origin}/start`, { headers: { Authorization: 'fixture-auth', Cookie: 'fixture-cookie' } }, 1000, 0);
  assert.equal(result.authorization, undefined);
  assert.equal(result.cookie, undefined);
  assert.equal(destination.received[0].headers.authorization, undefined);
});

test('a cross-origin redirect rejects a POST body before sending it to the destination', async t => {
  const destination = await server(t, (_req, res) => json(res, {}));
  const source = await server(t, (_req, res) => redirect(res, `${destination.origin}/collect`, 307));
  await assert.rejects(makeRequest(`${source.origin}/token`, { method: 'POST', body: 'fixture-secret-body', throwOnError: false }, 1000, 0), policy);
  assert.equal(destination.received.length, 0);
});

test('an origin allowlist rejects an initial foreign URL before any request', async t => {
  const lab = await server(t, (_req, res) => json(res, {}));
  await assert.rejects(makeRequest(`${lab.origin}/private`, { allowedOrigins: ['https://api.spotify.com'], throwOnError: false }, 1000, 2, 0), policy);
  assert.equal(lab.received.length, 0);
});

test('an allowlist rejects a forbidden redirect once even with throwOnError disabled and retries configured', async t => {
  const destination = await server(t, (_req, res) => json(res, {}));
  const source = await server(t, (_req, res) => redirect(res, destination.origin));
  await assert.rejects(makeRequest(source.origin, { allowedOrigins: [source.origin], throwOnError: false }, 1000, 2, 0), policy);
  assert.equal(source.received.length, 1);
  assert.equal(destination.received.length, 0);
});

test('credential-bearing and unsupported-scheme URLs are rejected before a socket is opened', async t => {
  const lab = await server(t, (_req, res) => json(res, {}));
  for (const target of [`http://user:fixture-secret@127.0.0.1:${lab.port}/`, `gopher://127.0.0.1:${lab.port}/`]) {
    await assert.rejects(makeRequest(target, { throwOnError: false }, 1000, 0), policy);
  }
  assert.equal(lab.received.length, 0);
});

test('abort interrupts HTTP retry backoff instead of waiting through later retry delays', async t => {
  const controller = new AbortController();
  const lab = await server(t, (_req, res) => { res.writeHead(503); res.end(); setImmediate(() => controller.abort()); });
  const operation = makeRequest(lab.origin, { signal: controller.signal, throwOnError: true }, 1000, 3, 200);
  const result = await outcome(operation);
  assert.ok(result.error, 'aborted retry backoff must reject promptly');
  assert.equal(result.error.code, 'ABORT_ERR');
  assert.equal(lab.received.length, 1);
});

test('Spotify rejects a foreign API URL before fetching credentials', async t => {
  const lab = await providers(t, (req, res) => json(res, upstream(req) === 'accounts.spotify.com' ? { access_token: 'fixture-token', expires_in: 3600 } : {}));
  const source = spotify({ accessToken: undefined, clientId: 'fixture-client', clientSecret: 'fixture-secret' });
  await assert.rejects(source.apiRequest('https://attacker.invalid/collect'), policy);
  assert.equal(lab.received.length, 0);
});

test('Spotify API URLs must stay below the HTTPS v1 path', async t => {
  const lab = await providers(t, (_req, res) => json(res, {}));
  const source = spotify();
  await assert.rejects(source.apiRequest('https://api.spotify.com/v1-other/collect'), policy);
  assert.equal(lab.received.length, 0);
});

test('Spotify API redirects cannot forward a bearer token to a foreign origin', async t => {
  const lab = await providers(t, (req, res) => upstream(req) === 'api.spotify.com' ? redirect(res, 'https://attacker.invalid/collect') : json(res, {}));
  await assert.rejects(spotify().apiRequest('/tracks/example'), policy);
  assert.equal(lab.received.filter(req => upstream(req) === 'attacker.invalid').length, 0);
});

test('Spotify token redirects cannot forward client credentials or the request body to another origin', async t => {
  const lab = await providers(t, (req, res) => upstream(req) === 'accounts.spotify.com' ? redirect(res, 'https://api.spotify.com/token-collect', 307) : json(res, {}));
  const source = spotify({ accessToken: undefined, clientId: 'fixture-client', clientSecret: 'fixture-secret' });
  await assert.rejects(source.apiRequest('/tracks/example'), policy);
  assert.equal(lab.received.filter(req => upstream(req) !== 'accounts.spotify.com').length, 0);
});

test('Deezer API refuses foreign URLs and redirects before contacting another origin', async t => {
  const lab = await providers(t, (req, res) => upstream(req) === 'api.deezer.com' ? redirect(res, 'https://attacker.invalid/collect') : json(res, {}));
  const source = deezer();
  await assert.rejects(source.apiRequest('https://attacker.invalid/initial'), policy);
  await assert.rejects(source.apiRequest('/track/42'), policy);
  assert.equal(lab.received.filter(req => upstream(req) === 'attacker.invalid').length, 0);
});

test('Deezer short-link redirects reject foreign destinations before following them', async t => {
  const lab = await providers(t, (req, res) => upstream(req) === 'dzr.page.link' ? redirect(res, 'https://attacker.invalid/collect') : json(res, {}));
  await assert.rejects(deezer().resolveShortLink('https://dzr.page.link/example'), policy);
  assert.equal(lab.received.filter(req => upstream(req) === 'attacker.invalid').length, 0);
});

test('Deezer short-link resolution accepts an allowed HTTPS final URL without loading audio', async t => {
  const lab = await providers(t, (req, res) => upstream(req) === 'dzr.page.link' ? redirect(res, 'https://www.deezer.com/track/42') : json(res, {}));
  assert.equal(await deezer().resolveShortLink('https://dzr.page.link/example'), 'https://www.deezer.com/track/42');
  assert.deepEqual(lab.received.map(upstream), ['dzr.page.link', 'www.deezer.com']);
});

test('Deezer short links reject an HTTP initial URL before making a request', async t => {
  const lab = await providers(t, (_req, res) => json(res, {}));
  await assert.rejects(deezer().resolveShortLink('http://dzr.page.link/example'), policy);
  assert.equal(lab.received.length, 0);
});

test('Deezer short-link cycles fail within the configured redirect budget', async t => {
  const lab = await providers(t, (req, res) => redirect(res, `https://dzr.page.link/hop${lab.received.length}`));
  await assert.rejects(deezer().resolveShortLink('https://dzr.page.link/start'), /redirect|limit|hop/i);
  assert.ok(lab.received.length <= 6);
});

test('provider API and short-link HTTP requests install a finite ten-second budget', async t => {
  const lab = await providers(t, (_req, res) => json(res, {}));
  await spotify().apiRequest('/tracks/example');
  await deezer().apiRequest('/track/42');
  await deezer().resolveShortLink('https://dzr.page.link/example');
  assert.equal(lab.received.length, 3);
  assert.equal(lab.budgets.length, 3);
  assert.ok(lab.budgets.every(timeout => timeout === 10000));
});

for (const kind of ['Spotify', 'Deezer']) {
  test(`${kind} propagates a caller AbortSignal to its native HTTP request`, async t => {
    const entered = deferred();
    const responses = [];
    await providers(t, (_req, res) => { responses.push(res); entered.resolve(); });
    const controller = new AbortController();
    const source = kind === 'Spotify' ? spotify() : deezer();
    const operation = source.search('example', { signal: controller.signal });
    const observed = operation.then(value => ({ value }), error => ({ error }));
    await entered.promise;
    controller.abort();
    const result = await outcome(observed.then(value => value.error ? Promise.reject(value.error) : value.value));
    for (const res of responses) if (!res.destroyed) json(res, { data: [], tracks: { items: [] } });
    await observed;
    assert.ok(result.error, 'provider request must observe caller cancellation');
    assert.equal(result.error.code, 'ABORT_ERR');
  });
}

test('Spotify rejects a repeated pagination URL instead of returning an unbounded or partial playlist', async t => {
  let pages = 0;
  const next = 'https://api.spotify.com/v1/repeated';
  await providers(t, (req, res) => {
    if (req.path.startsWith('/v1/albums/')) return json(res, { name: 'fixture', tracks: { items: [], next } });
    pages++;
    json(res, pages > 3 ? { error: { message: 'fixture stops an unfixed loop' } } : { items: [], next });
  });
  await assert.rejects(spotify().load('https://open.spotify.com/album/example'), /page|pagination|loop/i);
  assert.ok(pages <= 2);
});

test('Spotify pagination has a finite hundred-page ceiling even if every next URL is distinct', async t => {
  let pages = 0;
  await providers(t, (req, res) => {
    if (req.path.startsWith('/v1/albums/')) return json(res, { name: 'fixture', tracks: { items: [], next: 'https://api.spotify.com/v1/page/1' } });
    pages++;
    json(res, pages > 105 ? { error: { message: 'fixture caps baseline requests' } } : { items: [], next: `https://api.spotify.com/v1/page/${pages + 1}` });
  });
  await assert.rejects(spotify().load('https://open.spotify.com/album/example'), /page|pagination|limit/i);
  assert.ok(pages <= 100);
});

for (const stage of ['native', 'custom']) {
  test(`the search deadline includes a pending ${stage} resolver`, async t => {
    const pending = deferred();
    const resolver = stage === 'custom' ? () => pending.promise : undefined;
    const { manager } = searching(t, { timeoutMs: 25, resolver });
    if (stage === 'native') manager.resolveNativeSource = () => pending.promise;
    const operation = manager.search({ query: 'example' });
    const result = await outcome(operation);
    pending.resolve(null);
    await operation.catch(() => {});
    assert.equal(result.error?.code, 'ETIMEDOUT');
  });
}

test('native resolution and backend fallback consume one shared search deadline', async t => {
  const { manager, node } = searching(t, { timeoutMs: 20, fallbackPlatforms: ['soundcloud'] });
  manager.resolveNativeSource = async () => { await delay(15); return null; };
  let loads = 0;
  node.rest.loadTracks = async () => { loads++; await delay(15); return loads === 1 ? { loadType: 'empty', data: {} } : { loadType: 'track', data: record() }; };
  const result = await outcome(manager.search({ query: 'example' }));
  assert.equal(result.error?.code, 'ETIMEDOUT');
  assert.ok(loads <= 1);
});
