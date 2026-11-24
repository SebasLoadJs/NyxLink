const fs=require('node:fs/promises');
const {performance}=require('node:perf_hooks');
const assert=require('node:assert/strict');
const {Manager,createAuroraPinoEngine}=require('../dist');
async function measure(mode,iterations=5000){
 let bytes=0,records=0;const latencies=[];
 const engine=mode==='json'?createAuroraPinoEngine('debug',(record,meta)=>{records++;bytes+=Buffer.byteLength(JSON.stringify({...record,level:meta.level,msg:meta.msg}));}):undefined;
 const manager=new Manager({nodes:[{host:'localhost',port:2333,password:'fixture'}],options:engine?{logging:{level:'debug',target:engine.target}}:mode==='silent'?{logging:{level:'silent'}}:{}});
 global.gc?.();const before=process.memoryUsage().heapUsed;const start=performance.now();
 try{
  for(let i=0;i<iterations;i++){const tick=performance.now();manager.emit('queueAdd',{node:{backend:{kind:'nodelink'}}},[{}]);latencies.push(performance.now()-tick);}
  const elapsedMs=performance.now()-start;global.gc?.();latencies.sort((a,b)=>a-b);
  assert.equal(records,mode==='json'?iterations:0);
  return {mode,iterations,records,bytes,elapsedMs,operationsPerSecond:iterations*1000/Math.max(elapsedMs,0.001),enqueueP50Ms:latencies[Math.floor(iterations*0.5)],enqueueP95Ms:latencies[Math.floor(iterations*0.95)],heapDeltaBytes:process.memoryUsage().heapUsed-before};
 }finally{await manager.shutdown();engine?.close();}
}
(async()=>{const results=[];for(const mode of ['disabled','silent','json'])results.push(await measure(mode));await fs.mkdir('.runtime/benchmarks',{recursive:true});await fs.writeFile('.runtime/benchmarks/logging.json',JSON.stringify({node:process.version,platform:process.platform,scope:'Synthetic canonical events; not audible playback or production soak',results},null,2)+'\n');for(const x of results)console.log(x.mode+': '+Math.round(x.operationsPerSecond)+' events/s; records='+x.records);})().catch(error=>{console.error(error.message);process.exitCode=1;});
