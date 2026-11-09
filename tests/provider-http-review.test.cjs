const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const { once } = require('node:events');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Manager, Node, NodeState, SpotifySource, DeezerSource } = require('../dist');
const { DatabaseManager } = require('../dist/src/managers/DatabaseManager');
const { makeRequest } = require('../dist/src/Util');
const { deferred } = require('./helpers/player.cjs');

async function server(t, handle) {
  const received = [];
  const active = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const row = { path: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() };
    received.push(row);
    handle(row, res);
  });
  active.listen(0, '127.0.0.1');
  await once(active, 'listening');
  t.after(async () => { active.closeAllConnections(); await new Promise(resolve => active.close(resolve)); });
  return { origin: `http://127.0.0.1:${active.address().port}`, port: active.address().port, received };
}
function json(res, body) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
function redirect(res, location, status = 302) { res.writeHead(status, { location }); res.end(); }
function policy(error) { return error.code === 'HTTP_POLICY_REJECTED' && typeof error.reason === 'string'; }
async function localProvider(t, handle) {
  const lab = await server(t, handle);
  const request = http.request;
  t.mock.method(https, 'request', (options, callback) => request({ ...options, hostname: '127.0.0.1', port: lab.port,
    protocol: 'http:', agent: undefined }, callback));
  return lab;
}

test('a malformed Deezer redirect rejects as policy data instead of escaping its response callback', async () => {
  const entry = require.resolve('../dist');
  const code = `
    const http=require('node:http');
    const https=require('node:https');
    const {DeezerSource}=require(${JSON.stringify(entry)});
    let done=false;
    const server=http.createServer((_req,res)=>{res.writeHead(302,{location:'http://['});res.end();});
    const timer=setTimeout(()=>finish({hung:true}),1500);
    function finish(result){if(done)return;done=true;clearTimeout(timer);process.stdout.write(JSON.stringify(result));server.closeAllConnections();server.close();}
    process.once('uncaughtException',error=>finish({uncaught:true,code:error.code}));
    server.listen(0,'127.0.0.1',()=>{
      const original=http.request;
      https.request=(options,callback)=>original({...options,hostname:'127.0.0.1',port:server.address().port,protocol:'http:',agent:undefined},callback);
      const source=new DeezerSource({options:{deezer:{}},emit(){}});
      source.resolveShortLink('https://dzr.page.link/example').then(value=>finish({value}),error=>finish({error:error.code,reason:error.reason,uncaught:false}));
    });`;
  const result = await promisify(execFile)(process.execPath, ['-e', code], { timeout: 3000 });
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.uncaught, false);
  assert.equal(evidence.error, 'HTTP_POLICY_REJECTED');
});

test('a Deezer redirect to exactly its current URL is a cycle rather than a successful final URL', async t => {
  const target = 'https://dzr.page.link/self';
  const lab = await localProvider(t, (_req, res) => redirect(res, target));
  const source = new DeezerSource({ options: { deezer: {} }, emit() {} });
  await assert.rejects(source.resolveShortLink(target), policy);
  assert.ok(lab.received.length <= 6);
});

test('a malformed generic redirect is a policy rejection without retry or success fallback', async t => {
  const lab = await server(t, (_req, res) => redirect(res, 'http://['));
  await assert.rejects(makeRequest(lab.origin, { throwOnError: false }, 1000, 2, 0), policy);
  assert.equal(lab.received.length, 1);
});

test('cross-origin redirects clear options.auth and raw sensitive headers while keeping a generated Host', async t => {
  const target = await server(t, (row, res) => json(res, row));
  const source = await server(t, (_row, res) => redirect(res, `${target.origin}/final`));
  const headers = ['Cookie', 'fixture-cookie', 'Cookie2', 'fixture-cookie2', 'hOsT', 'incorrect-host.invalid', 'X-Request-Id', 'fixture'];
  const initial = [...headers];
  const result = await makeRequest(source.origin, { auth: 'fixture-user:fixture-password', headers }, 1000, 0);
  assert.equal(result.headers.authorization, undefined);
  assert.equal(result.headers.cookie, undefined);
  assert.equal(result.headers.cookie2, undefined);
  assert.equal(result.headers['x-request-id'], 'fixture');
  assert.equal(result.headers.host, new URL(target.origin).host);
  assert.equal(source.received[0].headers.host, new URL(source.origin).host);
  assert.match(source.received[0].headers.authorization, /^Basic /);
  assert.deepEqual(headers, initial);
});

test('an already aborted native Spotify request does not fetch or transmit credentials', async t => {
  const lab = await localProvider(t, (_req, res) => json(res, { access_token: 'fixture-token', expires_in: 3600 }));
  const controller = new AbortController();
  controller.abort();
  const source = new SpotifySource({ options: { spotify: { clientId: 'fixture-client', clientSecret: 'fixture-secret' } }, emit() {} });
  await assert.rejects(source.search('example', { signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(lab.received.length, 0);
});

test('Manager native dispatch forwards its combined search AbortSignal into provider load', async t => {
  const manager = new Manager({ nodes: [{ host: '127.0.0.1', port: 2333, password: 'fixture' }],
    options: { database: { type: 'memory' }, spotify: { enabled: true, accessToken: 'fixture-token' } } });
  manager.database = new DatabaseManager(manager);
  const node = new Node(manager, { host: '127.0.0.1', port: 2333, password: 'fixture' });
  node.connected = true; node.state = NodeState.READY;
  manager.nodes.nodes.set(node.identifier, node);
  t.after(() => manager.shutdown());
  const entered = deferred();
  const release = deferred();
  let providerSignal;
  const source = new SpotifySource(manager);
  source.load = async (_query, options) => { providerSignal = options?.signal; entered.resolve(); return release.promise; };
  manager.spotifySource = source;
  const controller = new AbortController();
  const searching = manager.search({ query: 'spotify:track:example', signal: controller.signal });
  const observed = searching.then(value => ({ value }), error => ({ error }));
  await entered.promise;
  try {
    assert.ok(providerSignal instanceof AbortSignal);
    assert.equal(providerSignal.aborted, false);
    controller.abort();
    assert.equal(providerSignal.aborted, true);
  } finally { controller.abort(); release.resolve({ loadType: 'empty', data: {} }); }
  assert.equal((await observed).error.name, 'AbortError');
});

test('abort after two same-origin redirect hops cancels the final request with credentials scoped to that origin', async t => {
  const entered = deferred();
  const lab = await server(t, (row, res) => {
    if (row.path === '/one') redirect(res, '/two');
    else if (row.path === '/two') redirect(res, '/pending');
    else entered.resolve();
  });
  const controller = new AbortController();
  const operation = makeRequest(`${lab.origin}/one`, { headers: { Authorization: 'fixture-auth' }, signal: controller.signal, throwOnError: false }, 1000, 0);
  const rejected = assert.rejects(operation, error => error.code === 'ABORT_ERR');
  await entered.promise;
  controller.abort();
  await rejected;
  assert.equal(lab.received.length, 3);
  assert.ok(lab.received.every(row => row.headers.authorization === 'fixture-auth'));
});

test('same-origin POST redirects retain an acknowledged request body and authorization', async t => {
  const lab = await server(t, (row, res) => row.path === '/start' ? redirect(res, '/final', 307) : json(res, row));
  const result = await makeRequest(`${lab.origin}/start`, { method: 'POST', body: 'grant_type=fixture', headers: { Authorization: 'fixture-auth' } }, 1000, 0);
  assert.equal(result.method, 'POST');
  assert.equal(result.body, 'grant_type=fixture');
  assert.equal(result.headers.authorization, 'fixture-auth');
  assert.equal(lab.received.length, 2);
});

test('a native provider deadline aborts a response that keeps the socket active', { timeout: 15000 }, async t => {
  const timers = new Set();
  const fallback = new Set();
  const lab = await localProvider(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write(' ');
    const heartbeat = setInterval(() => res.write(' '), 40);
    timers.add(heartbeat);
    const finish = setTimeout(() => res.end('{"tracks":{"items":[]}}'), 12000);
    fallback.add(finish);
    res.once('close', () => { clearInterval(heartbeat); clearTimeout(finish); });
  });
  t.after(() => { for (const timer of timers) clearInterval(timer); for (const timer of fallback) clearTimeout(timer); });
  const source = new SpotifySource({ options: { spotify: { accessToken: 'fixture-token' } }, emit() {} });
  await assert.rejects(source.search('continuous-response'), error => error.code === 'ABORT_ERR');
  assert.equal(lab.received.length, 1);
});
