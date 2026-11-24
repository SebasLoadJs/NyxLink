const test=require('node:test');
const assert=require('node:assert/strict');
const {Manager,OpenTelemetry}=require('../dist');
const make=()=>new Manager({nodes:[{host:'localhost',port:2333,password:'fixture',secure:false}]});
test('active tracer failure does not repeat domain work',async()=>{
 const m=make();let calls=0,ends=0;
 const span={setStatus(){},setAttribute(){},end(){ends++;}};
 const t=new OpenTelemetry(m,{tracer:{startSpan(){throw Error('fallback');},startActiveSpan(_n,cb){cb(span);throw Error('instrumentation');}}});
 try{assert.equal(await t.operation('nyxlink.rest',async()=>{calls++;return 42;}),42);assert.equal(calls,1);assert.equal(ends,1);}
 finally{t.close();await m.shutdown();}
});
test('cancelled and failed operation spans end without leaking original errors',async()=>{
 const m=make(),spans=[],metrics=[];
 const t=new OpenTelemetry(m,{tracer:{startSpan(name){const s={name,attributes:{},ends:0,setAttribute(k,v){this.attributes[k]=v;},setStatus(v){this.status=v.code;},end(){this.ends++;}};spans.push(s);return s;}},meter:{createCounter(){return{add(){}};},createHistogram(name){return{record(value,attrs){metrics.push({name,value,attrs});}};}}});
 try{const error=Object.assign(Error('private-token'),{name:'AbortError'});
 await assert.rejects(t.operation('nyxlink.player.seek',async()=>{throw error;}),e=>e===error);
 await assert.rejects(t.operation('nyxlink.rest',async()=>{throw Error('private-url');}));
 await t.operation('nyxlink.failover',async()=>({status:'failed'}),()=> 'error');
 assert.deepEqual(spans.map(s=>s.status),[0,2,2]);assert.ok(spans.every(s=>s.ends===1));
 assert.deepEqual(metrics.map(m=>m.attrs.outcome),['cancelled','error','error']);assert.doesNotMatch(JSON.stringify({spans,metrics}),/private-/);
 }finally{t.close();await m.shutdown();}
});

test('node selection stays synchronous and arbitrary labels are excluded',async()=>{
 const m=make(), names=[], outcomes=[];
 const t=new OpenTelemetry(m,{tracer:{startSpan(name){names.push(name);return{setStatus(){},setAttribute(_k,v){outcomes.push(v);},end(){}};}}});
 try{
   assert.equal(m.nodes.findNode(),undefined);
   assert.equal(t.syncOperation('nyxlink.node.select',()=>42,()=> 'private-label'),42);
   assert.equal(await t.operation('private-operation',async()=>17),17);
   assert.deepEqual(names,['nyxlink.node.select','nyxlink.node.select']);
   assert.deepEqual(outcomes,['empty','resolved']);
 }finally{t.close();await m.shutdown();}
});

test('observable gauges report real counts and detach on close',async()=>{
 const m=make(),callbacks=new Map(),values=[];
 const meter={createCounter(){return{add(){}};},createHistogram(){return{record(){}};},
 createObservableGauge(name){return{addCallback(cb){callbacks.set(name,cb);},removeCallback(cb){if(callbacks.get(name)===cb)callbacks.delete(name);}};}};
 const t=new OpenTelemetry(m,{meter});
 try{
  m.nodes.nodes.set('fixture',{connected:true,destroyed:false});
  for(const [name,cb] of callbacks)cb({observe(value){values.push([name,value]);}});
  assert.deepEqual(values,[['nyxlink.nodes.connected',1],['nyxlink.players.active',0]]);
  t.close();assert.equal(callbacks.size,0);
 }finally{m.nodes.nodes.clear();t.close();await m.shutdown();}
});

test('handshake spans end once on ready, disconnect, destroy or telemetry close',async()=>{
 const {NodeState}=require('../dist');
 const m=make(),spans=[],metrics=[];
 const tracer={startSpan(name){const s={name,outcome:undefined,ends:0,setStatus(){},setAttribute(_key,value){this.outcome=value;},end(){this.ends++;}};spans.push(s);return s;}};
 const meter={createCounter(){return{add(){}};},createHistogram(name){return{record(value,attrs){metrics.push({name,value,attrs});}};}};
 const t=new OpenTelemetry(m,{tracer,meter});
 const node={backend:{kind:'lavalink'}};
 try{
  const state=(from,to)=>m.emit('nodeStateChange',node,from,to);
  state(NodeState.DISCONNECTED,NodeState.CONNECTING);
  state(NodeState.CONNECTING,NodeState.CONNECTING);
  state(NodeState.CONNECTING,NodeState.CONNECTED);
  state(NodeState.CONNECTED,NodeState.READY);
  state(NodeState.READY,NodeState.READY);
  state(NodeState.READY,NodeState.CONNECTING);
  state(NodeState.CONNECTING,NodeState.DISCONNECTED);
  state(NodeState.DISCONNECTED,NodeState.CONNECTING);
  t.close();
  assert.deepEqual(spans.map(s=>[s.name,s.outcome,s.ends]),[
   ['nyxlink.handshake','success',1],['nyxlink.handshake','error',1],['nyxlink.handshake','cancelled',1]]);
  assert.equal(metrics.length,3);assert.ok(metrics.every(x=>x.value>=0));
 }finally{t.close();await m.shutdown();}
});
test('additional REST calls emit transport spans without recording URL or response payload',async()=>{
 const http=require('node:http'),spans=[];
 const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({private:'secret-response'}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const m=new Manager({nodes:[{host:'127.0.0.1',port:server.address().port,password:'private-auth',secure:false}]});
 const t=new OpenTelemetry(m,{tracer:{startSpan(name){const span={name,attributes:{},setStatus(){},setAttribute(k,v){this.attributes[k]=v;},end(){spans.push(this);}};return span;}}});
 try{
  m.nodes.add({identifier:'fixture',host:'127.0.0.1',port:server.address().port,password:'private-auth',secure:false});
  const node=m.nodes.nodes.get('fixture');
  assert.deepEqual(await node.rest.getInfo(),{private:'secret-response'});
  const response=await node.rest.getInfoWithHeaders();
  assert.deepEqual(response.data,{private:'secret-response'});
  assert.deepEqual(spans.map(x=>x.name),['nyxlink.rest','nyxlink.rest']);
  assert.doesNotMatch(JSON.stringify(spans),/private-auth|secret-response/);
 }finally{t.close();await m.shutdown();await new Promise(resolve=>server.close(resolve));}
});
