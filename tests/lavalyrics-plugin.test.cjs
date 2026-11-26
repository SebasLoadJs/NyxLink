const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { BackendDetector } = require('../dist');
const { createPlayer, deferred } = require('./helpers/player.cjs');
const { lavaLyricsParameters, validateLavaLyrics } = require('../dist/src/backends/LavaLyricsContracts.js');

const valid = () => ({
  sourceName: 'youtube',
  provider: 'fixture-provider',
  text: null,
  lines: [
    { timestamp: 0, duration: 1200, line: 'test line', plugin: {} },
    { timestamp: 1250, duration: null, line: '', plugin: { normalized: true } }
  ],
  plugin: {}
});
const lavalink = (name = 'lavalyrics-plugin') =>
  BackendDetector.detect({ version: { semver: '4.2.2' }, plugins: [{ name, version: '1.0.0' }] });

test('LavaLyrics parameters are isolated from the NodeLink lyrics contract', () => {
  const query = lavaLyricsParameters('AQID/+=&?', { skipTrackSource: false });
  assert.equal(query.get('track'), 'AQID/+=&?');
  assert.equal(query.get('skipTrackSource'), 'false');
  assert.equal(query.has('encodedTrack'), false);
  assert.deepEqual([...lavaLyricsParameters('encoded')], [['track','encoded']]);
  assert.throws(() => lavaLyricsParameters(''), TypeError);
  assert.throws(() => lavaLyricsParameters('a', { skipTrackSource: 'true' }), TypeError);
  assert.throws(() => lavaLyricsParameters('a'.repeat(65537)), TypeError);
});

test('LavaLyrics schema rejects malformed timestamps, nested metadata and envelopes', () => {
  validateLavaLyrics(valid());
  for (const corrupted of [
    { ...valid(), text: 123 },
    { ...valid(), plugin: null },
    { ...valid(), lines: null },
    { ...valid(), lines: [{ ...valid().lines[0], timestamp: -1 }] },
    { ...valid(), lines: [{ ...valid().lines[0], timestamp: Infinity }] },
    { ...valid(), lines: [{ ...valid().lines[0], duration: -1 }] },
    { ...valid(), lines: [{ ...valid().lines[0], plugin: [] }] },
    { ...valid(), lines: [{ ...valid().lines[0], line: null }] }
  ]) assert.throws(() => validateLavaLyrics(corrupted), { code: 'INVALID_PROTOCOL_RESPONSE' });
});

test('unrelated Lavalink plugins and NodeLink cannot use the LavaLyrics endpoint', async t => {
  const { node } = createPlayer(t);
  node.backend = BackendDetector.detect({
    version: { semver: '4.2.2' }, plugins: [{ name: 'lavasrc-plugin', version: '4.0.0' }]
  });
  await assert.rejects(node.getLavaLyrics('abc'), { code: 'FEATURE_UNAVAILABLE' });
  node.backend = BackendDetector.detect({
    version: { semver: '3.10.0' }, isNodelink: true,
    plugins: [{ name: 'lavalyrics-plugin', version: '1.0.0' }]
  });
  node.isNodeLink = true;
  await assert.rejects(node.getLavaLyrics('abc'), { code: 'FEATURE_UNAVAILABLE' });
});

async function setup(t, handler, pluginName = 'lavalyrics-plugin') {
  const { node } = createPlayer(t);
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body });
    await handler(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  node.port = server.address().port;
  node.backend = lavalink(pluginName);
  node.isNodeLink = false;
  node.sessionId = 'fixture-session';
  return { node, requests };
}

test('LavaLyrics reads a validated 200 response via the plugin route only', async t => {
  const { node, requests } = await setup(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(valid()));
  });
  const result = await node.getLavaLyrics({ encoded: 'AQ/+=?' }, { skipTrackSource: true });
  assert.deepEqual(result, valid());
  assert.deepEqual(requests.map(({method,url,authorization}) =>
    ({method,url,authorization})), [{
      method: 'GET',
      url: '/v4/lyrics?track=AQ%2F%2B%3D%3F&skipTrackSource=true',
      authorization: 'test-only'
    }]);
  assert.equal(node.backend.describeFeature('lavalyrics').evidence, 'observed');
  assert.equal(node.backend.featureStatus('lavalyrics'), 'available');
});

test('LavaLyrics 204 without content is a valid unavailable-lyrics result', async t => {
  const { node } = await setup(t, (_req, res) => { res.writeHead(204, { 'content-type': 'application/json' }); res.end(); }, 'lavalyrics');
  assert.equal(await node.rest.getLavaLyrics('encoded'), null);
  assert.equal(node.backend.featureStatus('lavalyrics'), 'available');
});

test('invalid 200 lyrics payload does not mark endpoint support as observed', async t => {
  let malformed = '{"sourceName":"youtube","provider":"x","text":null,"lines":[{"timestamp":-2}],"plugin":{}}';
  const { node } = await setup(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(malformed);
  });
  await assert.rejects(node.getLavaLyrics('encoded'), { code: 'INVALID_PROTOCOL_RESPONSE' });
  malformed = '{}';
  await assert.rejects(node.getLavaLyrics('encoded'), { code: 'INVALID_PROTOCOL_RESPONSE' });
  assert.equal(node.backend.featureStatus('lavalyrics'), 'unknown');
});

test('explicit disabled endpoint is gated; unauthorized HTTP is not confused with absence', async t => {
  let status = 501;
  const { node, requests } = await setup(t, (_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: status === 501 ? 'disabled' : 'unauthorized' }));
  });
  await assert.rejects(node.rest.getLavaLyrics('encoded'), { code: 'FEATURE_UNAVAILABLE' });
  assert.equal(node.backend.featureStatus('lavalyrics'), 'unavailable');
  await assert.rejects(node.rest.getLavaLyrics('encoded'), { code: 'FEATURE_UNAVAILABLE' });
  assert.equal(requests.length, 1);
  status = 401;
});

test('credential rejection remains an HTTP error without poisoning plugin capability', async t => {
  const { node } = await setup(t, (_req, res) => { res.writeHead(401); res.end('unauthorized'); });
  await assert.rejects(node.getLavaLyrics('encoded'), error => {
    assert.equal(error.statusCode, 401);
    return true;
  });
  assert.equal(node.backend.featureStatus('lavalyrics'), 'unknown');
});

test('late plugin observations cannot update a replacement backend', async t => {
  const entered = deferred(), release = deferred();
  const { node } = await setup(t, async (_req, res) => {
    entered.resolve();
    await release.promise;
    res.writeHead(204); res.end();
  });
  const previous = node.backend;
  const pending = node.getLavaLyrics('encoded');
  await entered.promise;
  node.backend = lavalink();
  release.resolve();
  assert.equal(await pending, null);
  assert.equal(node.backend.featureStatus('lavalyrics'), 'unknown');
  assert.equal(previous.featureStatus('lavalyrics'), 'unknown');
});


test('LavaLyrics player endpoints have independent contracts and explicit 204 acknowledgement', async t => {
  const {node,requests}=await setup(t,(req,res)=>{
    if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(valid()));}
    else {res.writeHead(204);res.end();}
  });
  const guild='123456789012345678';
  assert.deepEqual(await node.rest.getCurrentLavaLyrics(guild,{skipTrackSource:true}),valid());
  await node.rest.subscribeLavaLyrics(guild,{skipTrackSource:false});
  await node.rest.unsubscribeLavaLyrics(guild);
  assert.deepEqual(requests.map(r=>[r.method,r.url]),[
    ['GET','/v4/sessions/fixture-session/players/'+guild+'/track/lyrics?skipTrackSource=true'],
    ['POST','/v4/sessions/fixture-session/players/'+guild+'/lyrics/subscribe?skipTrackSource=false'],
    ['DELETE','/v4/sessions/fixture-session/players/'+guild+'/lyrics/subscribe']]);
  for(const feature of ['lavalyrics:current','lavalyrics:subscribe','lavalyrics:unsubscribe'])assert.equal(node.backend.featureStatus(feature),'available');
  assert.equal(node.backend.featureStatus('lavalyrics'),'unknown');
});
test('LavaLyrics player no-track 404 is not absent plugin, malformed ack fails', async t=>{
  let status=404;
  const {node}=await setup(t,(_req,res)=>{res.writeHead(status,{'content-type':'application/json'});res.end(status===404?'{"message":"No track playing"}':'{}');});
  const guild='123456789012345678';
  await assert.rejects(node.rest.getCurrentLavaLyrics(guild),e=>e.statusCode===404);
  assert.equal(node.backend.featureStatus('lavalyrics:current'),'unknown');
  status=200;await assert.rejects(node.rest.subscribeLavaLyrics(guild),{code:'INVALID_PROTOCOL_RESPONSE'});
  assert.equal(node.backend.featureStatus('lavalyrics:subscribe'),'unknown');
});
