const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { BackendPluginRouteRegistry, BackendDetector } = require('../dist');
const { createPlayer, deferred } = require('./helpers/player.cjs');
const definition = { backend:'lavalink', plugin:'custom-plugin', id:'profile', scope:'node', method:'GET', path:'custom/profile',
  decode(v) { assert.equal(typeof v?.profile,'string'); return v.profile; } };
const backend = (kind='lavalink', plugin='custom-plugin') => BackendDetector.detect({ version:{semver:kind==='lavalink'?'4.2.2':'3.10.0'}, isNodelink:kind==='nodelink', plugins:[{name:plugin,version:'1.0.0'}] });
test('plugin registry is identity-bound, bounded, detached, and cannot override core routes', () => {
  const registry = new BackendPluginRouteRegistry();
  const route = registry.register(definition);
  assert.ok(Object.isFrozen(route));
  assert.ok(registry.owns(route));
  assert.equal(registry.owns({...route}),false);
  assert.throws(()=>registry.register(definition),/already registered/);
  for (const path of ['../info','https://host/path','%2e%2e/info','sessions/abc','lyrics','plugins/other/profile','custom//x','custom?foo']) assert.throws(()=>registry.register({...definition,id:'bad',path}),TypeError);
  assert.equal(registry.list()[0].decode,undefined);
  registry.list()[0].path='info';
  assert.equal(route.path,'custom/profile');
  assert.equal(registry.remove(route),true);
  assert.equal(registry.remove(route),false);
  registry.close();
  assert.throws(()=>registry.register(definition),/closed/);
});
async function setup(t, handler) {
  const {manager,node,player}=createPlayer(t);
  const calls=[];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const c of req)body+=c;
    calls.push({method:req.method,url:req.url,auth:req.headers.authorization,body});
    await handler(req,res);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  node.port=server.address().port;node.backend=backend();node.sessionId='fixture-session';
  return {manager,node,player,calls};
}
const reply=(res,v)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(v));};
test('registered route requires matching advertised plugin, validates result, and does not forward arbitrary URLs',async t=>{
  const {manager,node,calls}=await setup(t,(_req,res)=>reply(res,{profile:'studio'}));
  const route=manager.pluginRoutes.register(definition);
  await assert.rejects(node.rest.callPlugin({...route}),/Unregistered/);
  node.backend=backend('lavalink','other');await assert.rejects(node.rest.callPlugin(route),{code:'FEATURE_UNAVAILABLE'});
  node.backend=backend('nodelink');await assert.rejects(node.rest.callPlugin(route),{code:'FEATURE_UNAVAILABLE'});
  node.backend=backend();
  assert.equal(await node.rest.callPlugin(route,{query:new URLSearchParams({q:'a/b?'})}),'studio');
  assert.deepEqual(calls,[{method:'GET',url:'/v4/custom/profile?q=a%2Fb%3F',auth:'test-only',body:''}]);
  assert.equal(node.backend.describeFeature('custom-plugin:custom-plugin:profile').evidence,'observed');
});
test('player mutation uses the current guild lease and rejects removed or stale routes',async t=>{
  const entered=deferred(),release=deferred();
  const {manager,node,player,calls}=await setup(t,async(_req,res)=>{entered.resolve();await release.promise;reply(res,{profile:'studio'});});
  const route=manager.pluginRoutes.register({...definition,scope:'player',method:'PATCH'});
  await assert.rejects(node.rest.callPlugin(route,{guildId:'invalid'}),TypeError);
  const pending=node.rest.callPlugin(route,{guildId:player.guildId,body:{profile:'studio'}});
  await entered.promise;manager.pluginRoutes.remove(route);release.resolve();
  await assert.rejects(pending,/context changed/);
  assert.equal(calls[0].url,'/v4/sessions/fixture-session/players/'+player.guildId+'/custom/profile');
  assert.equal(calls[0].body,'{"profile":"studio"}');
  assert.equal(node.backend.featureStatus('custom-plugin:custom-plugin:profile'),'unknown');
});
test('malformed response, redirect and HTTP failures are not positive capability observations',async t=>{
  let mode='bad';
  const {manager,node,calls}=await setup(t,(_req,res)=>{if(mode==='bad')reply(res,{profile:42});else if(mode==='redirect'){res.writeHead(302,{location:'/v4/info'});res.end();}else{res.writeHead(401);res.end('unauthorized');}});
  const route=manager.pluginRoutes.register(definition);
  await assert.rejects(node.rest.callPlugin(route));
  mode='redirect';await assert.rejects(node.rest.callPlugin(route));
  mode='auth';await assert.rejects(node.rest.callPlugin(route),e=>e.statusCode===401);
  assert.equal(calls.length,3);
  assert.equal(node.backend.featureStatus('custom-plugin:custom-plugin:profile'),'unknown');
});
test('NodeLink custom route also works when its own plugin is advertised',async t=>{
  const {manager,node}=await setup(t,(_req,res)=>reply(res,{profile:'native'}));
  node.backend=backend('nodelink');
  const route=manager.pluginRoutes.register({...definition,backend:'nodelink'});
  assert.equal(await node.rest.callPlugin(route),'native');
});
