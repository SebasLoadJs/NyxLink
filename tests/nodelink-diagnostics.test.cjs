const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {BackendDetector}=require('../dist');
const {createPlayer}=require('./helpers/player.cjs');
const {readNodeLinkProfilerSnapshot,readNodeLinkWorkerSnapshots}=require('../dist/src/backends/NodeLinkDiagnostics.js');
const memory={rss:100,heapTotal:80,heapUsed:40,external:10,arrayBuffers:5};
const snapshot={action:'status',scope:'all',timestamp:1000,master:{success:true,pid:9,memory,inspectorUrl:'secret',runtime:{trace:'private'}},workers:[{clusterId:1,uniqueId:2,pid:3,response:{success:true,memory}},{clusterId:2,uniqueId:3,pid:null,error:'private failure'}],sourceWorkers:[],sourceWorkersError:'not enabled'};
test('profiler projection preserves partial failures and strips sensitive diagnostics',()=>{
 const result=readNodeLinkProfilerSnapshot(snapshot,'all');
 assert.deepEqual(result.master,{success:true,pid:9,memory});
 assert.equal(result.workers[1].success,false);assert.equal(result.sourceWorkersUnavailable,true);
 assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes('secret'));
 assert.throws(()=>readNodeLinkProfilerSnapshot({...snapshot,scope:'master'},'all'),{code:'INVALID_PROTOCOL_RESPONSE'});
 assert.throws(()=>readNodeLinkProfilerSnapshot({...snapshot,master:{success:true,memory:{rss:1}}},'all'),{code:'INVALID_PROTOCOL_RESPONSE'});
});
test('worker snapshots are detached and malformed metrics fail closed',()=>{
 const worker={id:1,stats:{players:2,cpu:{nodelinkLoad:0.5},memory:{used:1024,allocated:2048},eventLoopLagP95:4},health:true};
 assert.deepEqual(readNodeLinkWorkerSnapshots([worker]),[{id:1,health:true,players:2,eventLoopLagP95:4,cpuLoad:0.5,memoryUsed:1024,memoryAllocated:2048}]);
 assert.throws(()=>readNodeLinkWorkerSnapshots([worker,worker]),{code:'INVALID_PROTOCOL_RESPONSE'});
 assert.throws(()=>readNodeLinkWorkerSnapshots([{id:2,stats:{players:-1}}]),{code:'INVALID_PROTOCOL_RESPONSE'});
});
test('privileged status uses header authentication, no redirect, and explicit loopback opt-in',async t=>{
 const {node}=createPlayer(t),calls=[];
 let deny=false;
 const server=http.createServer((req,res)=>{
  calls.push({url:req.url,code:req.headers['x-nodelink-code'],auth:req.headers.authorization});
  res.writeHead(deny?403:200,{'content-type':'application/json'});
  res.end(JSON.stringify(deny?{message:'fixture-private-code'}:req.url.startsWith('/v4/workers')?[{id:1,stats:{players:2}}]:snapshot));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 node.port=server.address().port;node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});node.isNodeLink=true;
 await assert.rejects(node.rest.getNodeLinkProfilerStatus({code:'fixture-private-code'}),/HTTPS/);
 const options={code:'fixture-private-code',allowLoopbackHttp:true};
 const result=await node.rest.getNodeLinkProfilerStatus(options);
 assert.equal(result.master.success,true);
 assert.deepEqual(calls[0],{url:'/v4/profiler?action=status&scope=all',code:'fixture-private-code',auth:'test-only'});
 assert.deepEqual(await node.rest.getNodeLinkWorkerSnapshots(),[{id:1,players:2}]);
 deny=true;
 await assert.rejects(node.rest.getNodeLinkProfilerStatus(options),e=>e.statusCode===403&&!JSON.stringify(e).includes('fixture-private-code'));
 node.backend=BackendDetector.detect({version:{semver:'4.2.2'}});node.isNodeLink=false;
 await assert.rejects(node.rest.getNodeLinkProfilerStatus(options),{code:'FEATURE_UNAVAILABLE'});
});
