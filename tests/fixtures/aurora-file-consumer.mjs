import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Manager} from 'nyxlink';
import {createAuroraFilePipeline} from 'nyxlink/aurora/file';
const dir=await mkdtemp(join(tmpdir(),'aurora-file-'));
try{
 const path=join(dir,'events.ndjson');
 const pipeline=await createAuroraFilePipeline(path,{level:'debug'});
 const manager=new Manager({nodes:[{host:'localhost',port:2333,password:'fixture'}],options:{logging:{level:pipeline.level,target:pipeline.target}}});
 try{
  manager.emit('nodeReady',{backend:{kind:'nodelink'}},{token:'PRIVATE_CANARY'});
  await pipeline.close();
  const raw=await readFile(path,'utf8');assert.doesNotMatch(raw,/PRIVATE_CANARY|\x1b/);
  assert.deepEqual(raw.trim().split('\n').map(line=>JSON.parse(line).eventCode),['NODE_READY']);
  await assert.rejects(createAuroraFilePipeline(path),{code:'EEXIST'});
 }finally{await manager.shutdown();await pipeline.close();}
 const saturatedPath=join(dir,'saturated.ndjson');
 const bounded=await createAuroraFilePipeline(saturatedPath,{maxQueued:1});
 const event={eventCode:'NODE_READY',timestamp:new Date().toISOString(),sanitizedContext:{backend:'nodelink'}};
 bounded.target.info(event,'ready');
 bounded.target.info(event,'ready');
 await assert.rejects(bounded.close(),/capacity exceeded/);
 assert.equal((await readFile(saturatedPath,'utf8')).trim().split('\n').length,1);
}finally{await rm(dir,{recursive:true,force:true});}
