const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { BackendDetector, lavalinkSponsorBlockCategories } = require('../dist');
const { createPlayer, deferred } = require('./helpers/player.cjs');
const { sponsorBlockCategoryBody, validateSponsorBlockCategories, lavalinkSponsorBlockPath } =
  require('../dist/src/backends/LavalinkSponsorBlockContracts.js');

const guildId = '123456789012345678';
const backend = name => BackendDetector.detect({
  version: { semver: '4.2.2' },
  plugins: [{ name: name ?? 'sponsorblock-plugin', version: '3.0.0' }]
});

test('Lavalink categories and routes reject unsupported operations and invalid path pieces', () => {
  assert.equal(lavalinkSponsorBlockCategories.length, 8);
  assert.deepEqual(sponsorBlockCategoryBody(['sponsor','intro']), ['sponsor','intro']);
  assert.throws(() => sponsorBlockCategoryBody(['unknown']), TypeError);
  assert.throws(() => sponsorBlockCategoryBody(['sponsor','sponsor']), TypeError);
  assert.throws(() => sponsorBlockCategoryBody('sponsor'), TypeError);
  assert.throws(() => validateSponsorBlockCategories({ categories:['sponsor'] }), { code:'INVALID_PROTOCOL_RESPONSE' });
  assert.throws(() => validateSponsorBlockCategories(['invalid']), { code:'INVALID_PROTOCOL_RESPONSE' });
  assert.throws(() => validateSponsorBlockCategories(['intro','intro']), { code:'INVALID_PROTOCOL_RESPONSE' });
  assert.equal(lavalinkSponsorBlockPath('my_session',guildId),
    '/v4/sessions/my_session/players/'+guildId+'/sponsorblock/categories');
  assert.throws(() => lavalinkSponsorBlockPath('..',guildId), TypeError);
  assert.throws(() => lavalinkSponsorBlockPath('session','x/..'), TypeError);
});

test('NodeLink and unrelated Lavalink plugins cannot use Lavalink SponsorBlock', async t => {
  const { node } = createPlayer(t);
  node.sessionId = 'session';
  node.backend = backend('lavasrc-plugin');
  await assert.rejects(node.getLavalinkSponsorBlockCategories(guildId), {code:'FEATURE_UNAVAILABLE'});
  node.backend = BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true,
    plugins:[{name:'sponsorblock-plugin',version:'3.0.0'}]});
  node.isNodeLink = true;
  await assert.rejects(node.clearLavalinkSponsorBlockCategories(guildId), {code:'FEATURE_UNAVAILABLE'});
});

async function setup(t, handler) {
  const { node } = createPlayer(t);
  const requests = [];
  const server = http.createServer(async (req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    requests.push({method:req.method,url:req.url,body,authorization:req.headers.authorization});
    await handler(req,res);
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(done=>server.close(done));});
  node.port=server.address().port;
  node.sessionId='my_session';
  node.backend=backend();
  node.isNodeLink=false;
  return {node,requests};
}

test('GET PUT DELETE use the official plugin route without changing NodeLink state',async t=>{
  const {node,requests}=await setup(t,(req,res)=>{
    if(req.method==='GET'){
      res.writeHead(200,{'content-type':'application/json'});
      res.end('["sponsor","intro"]');
    }else{res.writeHead(204);res.end();}
  });
  const saved=['sponsor','intro'];
  assert.deepEqual(await node.getLavalinkSponsorBlockCategories(guildId),saved);
  await node.setLavalinkSponsorBlockCategories(guildId,saved);
  await node.clearLavalinkSponsorBlockCategories(guildId);
  assert.deepEqual(requests.map(({method,url,body,authorization})=>({method,url,body,authorization})),[
    {method:'GET',url:'/v4/sessions/my_session/players/'+guildId+'/sponsorblock/categories',body:'',authorization:'test-only'},
    {method:'PUT',url:'/v4/sessions/my_session/players/'+guildId+'/sponsorblock/categories',body:'["sponsor","intro"]',authorization:'test-only'},
    {method:'DELETE',url:'/v4/sessions/my_session/players/'+guildId+'/sponsorblock/categories',body:'',authorization:'test-only'}
  ]);
  assert.equal(node.backend.describeFeature('lavalink:sponsorblock').evidence,'observed');
  assert.equal(node.backend.featureStatus('lavalink:sponsorblock'),'available');
  assert.deepEqual(saved,['sponsor','intro']);
});

test('malformed GET result fails without capability observation',async t=>{
  const {node}=await setup(t,(_req,res)=>{
    res.writeHead(200,{'content-type':'application/json'});
    res.end('{"categories":["sponsor"]}');
  });
  await assert.rejects(node.getLavalinkSponsorBlockCategories(guildId),{code:'INVALID_PROTOCOL_RESPONSE'});
  assert.equal(node.backend.featureStatus('lavalink:sponsorblock'),'unknown');
});

test('invalid categories or session IDs are rejected before touching the server',async t=>{
  const {node,requests}=await setup(t,(_req,res)=>{res.writeHead(204);res.end();});
  await assert.rejects(node.setLavalinkSponsorBlockCategories(guildId,['bad']),TypeError);
  node.sessionId='../bad';
  await assert.rejects(node.clearLavalinkSponsorBlockCategories(guildId),TypeError);
  assert.equal(requests.length,0);
});

test('feature 501 is observed only on the matching backend; HTTP 404 player error is not feature absence',async t=>{
  let status=501;
  const {node,requests}=await setup(t,(_req,res)=>{
    res.writeHead(status,{'content-type':'application/json'});
    res.end(JSON.stringify({message:status===501?'disabled':'Player not found'}));
  });
  await assert.rejects(node.getLavalinkSponsorBlockCategories(guildId),{code:'FEATURE_UNAVAILABLE'});
  assert.equal(node.backend.featureStatus('lavalink:sponsorblock'),'unavailable');
  await assert.rejects(node.getLavalinkSponsorBlockCategories(guildId),{code:'FEATURE_UNAVAILABLE'});
  assert.equal(requests.length,1);
  status=404;
  node.backend=backend();
  await assert.rejects(node.getLavalinkSponsorBlockCategories(guildId),err=>{
    assert.equal(err.statusCode,404);return true;
  });
  assert.equal(node.backend.featureStatus('lavalink:sponsorblock'),'unknown');
});

test('a late response must not update the replacement plugin inventory',async t=>{
  const entered=deferred(),release=deferred();
  const {node}=await setup(t,async (_req,res)=>{
    entered.resolve();await release.promise;
    res.writeHead(200,{'content-type':'application/json'});res.end('[]');
  });
  const old=node.backend;
  const pending=node.getLavalinkSponsorBlockCategories(guildId);
  await entered.promise;
  node.backend=backend();
  release.resolve();
  assert.deepEqual(await pending,[]);
  assert.equal(node.backend.featureStatus('lavalink:sponsorblock'),'unknown');
  assert.equal(old.featureStatus('lavalink:sponsorblock'),'unknown');
});
