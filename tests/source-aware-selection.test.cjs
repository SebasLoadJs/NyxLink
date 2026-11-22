const test=require('node:test');
const assert=require('node:assert/strict');
const {Manager,Node,NodeSelector,BackendDetector}=require('../dist');
const {NodeState}=require('../dist/src/typings/types');
const {SourceHealthMonitor}=require('../dist/src/nodes/SourceHealthMonitor');
const {DatabaseManager}=require('../dist/src/managers/DatabaseManager');
function node(identifier,status,receivedAt=Date.now()){
 const sourceHealth=new SourceHealthMonitor();
 if(status)sourceHealth.apply({op:'event',type:'SourceHealthSnapshotEvent',timestamp:10,sources:{youtube:{status}}},receivedAt);
 return {identifier,sourceHealth,connected:true,destroyed:false,state:NodeState.READY,regions:[],stats:{players:identifier==='a'?1:20},backend:BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true})};
}
test('source-aware selection is optional and prefers healthy over stale or degraded',()=>{
 const a=node('a','unavailable'),b=node('b','healthy'),c=node('c','degraded');
 assert.equal(NodeSelector.select([a,b,c],{selectionStrategy:'players'}),a);
 assert.equal(NodeSelector.select([a,b,c],{selectionStrategy:'players'},{preferSource:'youtube'}),b);
 assert.equal(NodeSelector.select([c,node('unknown')],{},{preferSource:'youtube'}).identifier,'unknown');
});
test('source preference respects hard requirements and treats expired telemetry as unknown',()=>{
 const a=node('a','healthy',Date.now()-100000),b=node('b','rate_limited');
 b.backend.recordFeature('required','available');
 assert.equal(NodeSelector.select([a,b],{},{preferSource:'youtube',sourceHealthMaxAgeMs:10}),a);
 assert.equal(NodeSelector.select([a,b],{},{preferSource:'youtube',requiredCapabilities:['required']}),b);
 assert.throws(()=>NodeSelector.select([a,b],{},{preferSource:'youtube',sourceHealthMaxAgeMs:0}),TypeError);
});
test('optional search preference chooses healthy initial node but respects explicit node',async t=>{
 const manager=new Manager({nodes:[{host:'127.0.0.1',port:2333,password:'test'}],options:{database:{type:'memory'},search:{sourceHealth:true}}});
 manager.database=new DatabaseManager(manager);
 const a=new Node(manager,{identifier:'a',host:'127.0.0.1',port:2333,password:'test'});
 const b=new Node(manager,{identifier:'b',host:'127.0.0.1',port:2334,password:'test'});
 const calls=[];
 for(const [n,status] of [[a,'unavailable'],[b,'healthy']]){
  n.connected=true;n.state=NodeState.READY;n.backend=node(n.identifier,status).backend;
  n.sourceHealth.apply({op:'event',type:'SourceHealthSnapshotEvent',sources:{youtube:{status}}});
  manager.nodes.nodes.set(n.identifier,n);
  n.rest.loadTracks=async identifier=>{calls.push([n.identifier,identifier]);return {loadType:'empty',data:{}};};
 }
 t.after(()=>manager.shutdown());
 await manager.search({query:'song'});
 await manager.search({query:'song',node:'a'});
 assert.deepEqual(calls,[['b','ytsearch:song'],['a','ytsearch:song']]);
});
