const test=require('node:test'),assert=require('node:assert/strict');
const {BackendDetector,BackendPluginEventRegistry}=require('../dist');
const {createPlayer}=require('./helpers/player.cjs');
const definition={backend:'lavalink',plugin:'example',type:'ProfileChanged',scope:'player',decode(value){if(typeof value.profile?.name!=='string')throw Error('invalid');return value.profile;}};
test('custom event registration is detached, scoped, isolated and removable',async t=>{
 const {manager,node,player}=createPlayer(t),received=[],logs=[];
 node.backend=BackendDetector.detect({version:{semver:'4.2.2'},plugins:[{name:'example',version:'1'}]});
 manager.on('debug',line=>logs.push(line));
 const registry=manager.pluginEvents;
 const unsub=registry.register(definition,(value,context)=>{received.push([value.name,context.player]);value.name='changed';});
 const raw={op:'event',type:'ProfileChanged',guildId:player.guildId,profile:{name:'studio'}};
 registry.dispatch(node,raw,()=>true);
 assert.deepEqual(received,[['studio',player]]);assert.equal(raw.profile.name,'studio');
 registry.dispatch(node,{...raw,guildId:'123456789012345679'},()=>true);
 registry.dispatch(node,raw,()=>false);
 assert.equal(received.length,1);
 registry.register(definition,()=>{throw Error('private payload');});
 registry.register(definition,async()=>{throw Error('private async');});
 registry.dispatch(node,raw,()=>true);
 await Promise.resolve();await Promise.resolve();
 assert.equal(received.length,2);assert.ok(logs.some(x=>x.includes('plugin event decoder or listener failed')));assert.ok(!logs.some(x=>x.includes('private payload')||x.includes('private async')));
 unsub();registry.dispatch(node,raw,()=>true);assert.equal(received.length,2);
 node.backend=BackendDetector.detect({version:{semver:'4.2.2'}});
 registry.dispatch(node,raw,()=>true);assert.equal(received.length,2);
 registry.close();assert.throws(()=>registry.register(definition,()=>{}),/closed/);
});
test('node-level events are dispatched through the real node message path without consuming raw events',async t=>{
 const {manager,node}=createPlayer(t),values=[],raws=[];
 node.backend=BackendDetector.detect({version:{semver:'4.2.2'},plugins:[{name:'example',version:'1'}]});
 manager.on('nodeRaw',(_node,raw)=>raws.push(raw));
 manager.pluginEvents.register({...definition,scope:'node'},(value,context)=>values.push([value.name,context.player]));
 const raw={op:'event',type:'ProfileChanged',profile:{name:'studio'}};
 await node.message({data:JSON.stringify(raw)});
 assert.deepEqual(values,[['studio',undefined]]);assert.deepEqual(raws,[raw]);
});
test('registry rejects invalid declarations and keeps metadata detached',()=>{
 const registry=new BackendPluginEventRegistry();
 for(const def of [{...definition,plugin:'BAD'},{...definition,type:'bad event'},{...definition,scope:'other'}])assert.throws(()=>registry.register(def,()=>{}),TypeError);
 registry.register(definition,()=>{});const list=registry.list();list[0].type='Other';
 assert.equal(registry.list()[0].type,'ProfileChanged');assert.equal(list[0].decode,undefined);
});

test('nodeRaw mutation cannot rewrite the validated custom event',async t=>{
 const {manager,node}=createPlayer(t),seen=[];
 node.backend=BackendDetector.detect({version:{semver:'4.2.2'},plugins:[{name:'example',version:'1'}]});
 manager.on('nodeRaw',(_node,raw)=>{raw.type='Other';raw.profile.name='modified';});
 manager.pluginEvents.register({...definition,scope:'node'},value=>{seen.push(value.name);});
 await node.message({data:JSON.stringify({op:'event',type:'ProfileChanged',profile:{name:'original'}})});
 assert.deepEqual(seen,['original']);
});
