const test=require('node:test');
const assert=require('node:assert/strict');
const {BackendDetector}=require('../dist');
const {createPlayer,deferred}=require('./helpers/player.cjs');
const {SourceHealthMonitor}=require('../dist/src/nodes/SourceHealthMonitor');
const snapshot=(timestamp,status='healthy')=>({op:'event',type:'SourceHealthSnapshotEvent',timestamp,sources:{youtube:{status}}});
const change=(timestamp,status='degraded')=>({op:'event',type:'SourceHealthChangeEvent',timestamp,source:'youtube',previousStatus:'healthy',status,reason:null});
const send=(node,payload)=>node.message({data:JSON.stringify(payload)});
function setup(node){node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});node.isNodeLink=true;}
test('source telemetry is detached and older events cannot replace newer entries',()=>{
 const monitor=new SourceHealthMonitor();
 monitor.apply(snapshot(10),1);monitor.apply(change(30),2);monitor.apply(snapshot(20),3);
 assert.equal(monitor.get('youtube').health.status,'degraded');
 assert.equal(monitor.apply(change(25)),undefined);
 const entry=monitor.get('youtube');entry.health.status='healthy';
 assert.equal(monitor.get('youtube').health.status,'degraded');
 monitor.clear();assert.deepEqual(monitor.list(),[]);
});
test('a legacy snapshot cannot overwrite a previously received change',()=>{
 const monitor=new SourceHealthMonitor();
 monitor.apply(change(30));monitor.apply(snapshot(undefined));
 assert.equal(monitor.get('youtube').health.status,'degraded');
});
test('global NodeLink events are emitted without a guild player',async t=>{
 const {node,manager}=createPlayer(t);setup(node);
 const events=[];manager.on('sourceHealthSnapshot',(_node,event)=>events.push(event));manager.on('sourceHealthChange',(_node,event)=>events.push(event));
 await send(node,snapshot(10));await send(node,change(20));await send(node,change(15));await send(node,change(25,'invalid'));
 assert.equal(events.length,2);assert.equal(node.sourceHealth.get('youtube').health.status,'degraded');
 await node.destroy();assert.deepEqual(node.sourceHealth.list(),[]);
});
test('health messages waiting for backend detection are discarded after a new connection generation',async t=>{
 const {node,manager}=createPlayer(t);setup(node);
 const gate=deferred();node.backendReady=gate.promise;
 let events=0;manager.on('sourceHealthSnapshot',()=>events++);
 const pending=send(node,snapshot(10));node.invalidateBackendRefresh();gate.resolve();await pending;
 assert.equal(events,0);assert.deepEqual(node.sourceHealth.list(),[]);
});
test('non-NodeLink backend does not accept source-health events',async t=>{
 const {node}=createPlayer(t);
 await send(node,snapshot(10));assert.deepEqual(node.sourceHealth.list(),[]);
});
