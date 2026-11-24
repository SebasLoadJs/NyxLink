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
