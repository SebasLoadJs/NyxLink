const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { BackendDetector, CapabilityRegistry, NodeSelector } = require('../dist');
const { createPlayer, deferred } = require('./helpers/player.cjs');

test('registry reports protocol, advertised, observed and unknown evidence independently', () => {
  const registry = new CapabilityRegistry(new Set(['source:http']));
  assert.deepEqual(registry.describe('tracks:load'), {feature:'tracks:load',state:'available',evidence:'protocol'});
  assert.deepEqual(registry.describe('source:http'), {feature:'source:http',state:'available',evidence:'advertised'});
  assert.deepEqual(registry.describe('lyrics'), {feature:'lyrics',state:'unknown',evidence:'none'});
  registry.record('source:http','unavailable');
  assert.deepEqual(registry.describe('source:http'), {feature:'source:http',state:'unavailable',evidence:'observed'});
  const snapshot=registry.list();
  snapshot.find(item=>item.feature==='source:http').state='available';
  assert.equal(registry.describe('source:http').state,'unavailable');
  assert.throws(()=>registry.record('','available'),TypeError);
});

test('plugin inventory is validated and does not imply optional endpoint support', () => {
  const adapter=BackendDetector.detect({version:{semver:'4.2.2'},plugins:[
    {name:'LavaSrc',version:'4.8.0'}, {name:'lavasrc',version:'duplicate'},
    {name:'youtube-plugin',version:'1.0.0'}, {name:'bad name',version:'1.0.0'},
    {name:'invalid',version:42}, null
  ]});
  assert.deepEqual(adapter.plugins.map(p=>p.name),['LavaSrc','youtube-plugin']);
  assert.equal(adapter.getPlugin('LAVASRC').version,'4.8.0');
  assert.equal(adapter.supports('plugin:lavasrc'),true);
  assert.equal(adapter.describeFeature('plugin:lavasrc').evidence,'advertised');
  assert.equal(adapter.featureStatus('lyrics'),'unavailable');
  assert.equal(adapter.featureStatus('lavalyrics'),'unknown');
  assert.equal(adapter.supports('source:spotify'),false);
  assert.equal(adapter.supports('plugin:invalid'),false);
});

test('case-insensitive NodeLink header and independent node inventories', () => {
  const data={version:{semver:'3.10.0'},plugins:[{name:'example',version:'1.2.3'}]};
  const a=BackendDetector.detect(data,{'IamNodeLink':'true'});
  const b=BackendDetector.detect(data,{'iamnodelink':'true'});
  a.recordFeature('lyrics','unavailable');
  assert.equal(a.kind,'nodelink');
  assert.equal(b.featureStatus('lyrics'),'unknown');
});

test('selection honors plugin advertisement without assuming endpoint availability', t=>{
  const {node}=createPlayer(t);
  node.backend=BackendDetector.detect({version:{semver:'4.2.2'},plugins:[{name:'example',version:'1.0.0'}]});
  assert.equal(NodeSelector.select([node],{}, {requiredCapabilities:['plugin:example']}),node);
  assert.equal(NodeSelector.select([node],{}, {requiredCapabilities:['plugin:example','lyrics']}),undefined);
});

for(const status of [200,501]){
  test('old backend response '+status+' cannot modify a replacement inventory', async t=>{
    const {node}=createPlayer(t);
    const entered=deferred(), release=deferred();
    const server=http.createServer(async (_req,res)=>{
      entered.resolve(); await release.promise;
      res.writeHead(status,{'content-type':'application/json'});
      res.end(status===200?'{"mixes":[]}':'{"message":"disabled"}');
    });
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
    node.port=server.address().port;
    const info={version:{semver:'3.10.0'},isNodelink:true};
    node.backend=BackendDetector.detect(info); node.isNodeLink=true;
    node.sessionId='fixture-session';
    const request=node.rest.getMixLayers('123456789012345678');
    const result=assert.rejects(request,/context changed/);
    await entered.promise;
    const replacement=BackendDetector.detect(info);
    node.backend=replacement;
    release.resolve(); await result;
    assert.equal(replacement.featureStatus('mix:list'),'unknown');
  });
}

test('reused detection inputs cannot mutate the previous capability inventory',()=>{
 const advertised=new Set();const first=BackendDetector.detect({version:{semver:'4.2.2'},sourceManagers:['http'],plugins:[{name:'example',version:'1.0.0'}]}, {}, advertised);
 const second=BackendDetector.detect({version:{semver:'4.2.2'},sourceManagers:['local']}, {}, advertised);
 assert.equal(first.supports('source:http'),true);assert.equal(first.supports('plugin:example'),true);
 assert.equal(first.supports('source:local'),false);assert.equal(second.supports('source:http'),false);assert.equal(second.supports('source:local'),true);
});

test('extension commands cannot use a session that changed during the ownership check',async t=>{
 const {node}=createPlayer(t);node.isNodeLink=true;node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});node.sessionId='old-session';
 let calls=0;const server=http.createServer((_req,res)=>{calls++;res.writeHead(204);res.end();});server.listen(0,'127.0.0.1');await once(server,'listening');node.port=server.address().port;
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const entered=deferred(),release=deferred();const original=node.manager.guildOwnership;
 node.manager.guildOwnership={assertCurrent:async()=>{entered.resolve();await release.promise;}};
 try{
  const pending=assert.rejects(node.rest.subscribeLyrics('123456789012345678'),/context changed/);
  await entered.promise;node.sessionId='new-session';release.resolve();await pending;assert.equal(calls,0);
 }finally{node.manager.guildOwnership=original;}
});
test('extension requests reject redirects without replaying credentials or commands',async t=>{
 const {node}=createPlayer(t);node.isNodeLink=true;node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});node.sessionId='session';
 let calls=0;const server=http.createServer((_req,res)=>{calls++;res.writeHead(307,{location:'/unexpected'});res.end();});server.listen(0,'127.0.0.1');await once(server,'listening');node.port=server.address().port;
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 await assert.rejects(node.rest.getMixLayers('123456789012345678'));assert.equal(calls,1);
});
