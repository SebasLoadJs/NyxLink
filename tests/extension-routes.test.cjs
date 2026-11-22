const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {BackendDetector,Rest}=require('../dist');
const {createPlayer}=require('./helpers/player.cjs');
const backend=()=>BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});
test('extension route catalog preserves method, transport and feature identity',()=>{
  const adapter=backend();
  assert.deepEqual(adapter.resolveExtension('loadstream'),{feature:'loadstream',method:'POST',path:'/v4/loadstream',transport:'stream'});
  assert.deepEqual(adapter.resolveExtension('youtube:config:update'),{feature:'youtube:config',method:'PATCH',path:'/v4/youtube/config',transport:'json'});
  assert.equal(adapter.resolveExtension('lyrics:unsubscribe',{sessionId:'session',guildId:'guild'}).path,'/v4/sessions/session/players/guild/lyrics/subscribe');
});
test('route identifiers and query parameters cannot inject a new path',()=>{
  const route=backend().resolveExtension('mix:update',{sessionId:'some/session',guildId:'guild?test',mixId:'layer#x',query:new URLSearchParams({x:'a&b'})});
  assert.equal(route.path,'/v4/sessions/some%2Fsession/players/guild%3Ftest/mix/layer%23x?x=a%26b');
  assert.throws(()=>backend().resolveExtension('mix:list',{sessionId:'..',guildId:'guild'}),TypeError);
  assert.throws(()=>backend().resolveExtension('mix:list'),TypeError);
  assert.throws(()=>backend().resolveExtension('constructor'),TypeError);
});
test('plugin presence cannot route a NodeLink endpoint through Lavalink',()=>{
  const adapter=BackendDetector.detect({version:{semver:'4.2.2'},plugins:[{name:'example',version:'1.0.0'}]});
  assert.throws(()=>adapter.resolveExtension('lyrics'),{code:'FEATURE_UNAVAILABLE'});
  const nodeLink=backend();nodeLink.recordFeature('youtube:config','unavailable');
  assert.throws(()=>nodeLink.resolveExtension('youtube:config:get'),{code:'FEATURE_UNAVAILABLE'});
  assert.throws(()=>nodeLink.resolveExtension('youtube:config:update'),{code:'FEATURE_UNAVAILABLE'});
});
test('REST uses catalog method and encoded route on the actual transport',async t=>{
  const {node,player}=createPlayer(t);
  const requests=[];
  const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push({url:req.url,method:req.method,body});res.setHeader('content-type','application/json');res.end('{}');});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  node.port=server.address().port;node.sessionId='session';node.backend=backend();node.isNodeLink=true;
  const rest=new Rest(node);
  await rest.updateMixLayerVolume(player.guildId,'layer/one',42);
  assert.deepEqual(requests,[{url:'/v4/sessions/session/players/'+player.guildId+'/mix/layer%2Fone',method:'PATCH',body:'{"volume":42}'}]);
  await assert.rejects(rest.removeMixLayer(player.guildId,'..'),TypeError);
  node.sessionId='';
  await assert.rejects(rest.getMixLayers(player.guildId),TypeError);
  assert.equal(requests.length,1);
});
