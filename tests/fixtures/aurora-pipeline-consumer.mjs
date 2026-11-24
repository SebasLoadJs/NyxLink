import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { Manager } from 'nyxlink';
import { createAuroraPipeline } from './aurora-pipeline.mjs';
for(const format of ['silent','json','pretty','aurora']){
    const chunks=[],events=[];
    const stream=new Writable({write(chunk,_encoding,done){chunks.push(chunk.toString());done();}});
    const pipeline=createAuroraPipeline({format,level:format==='silent'?'silent':'debug',stream,onEvent:e=>events.push(e)});
    const manager=new Manager({nodes:[{host:'localhost',port:2333,password:'private-password',secure:false}],options:{logging:{level:pipeline.level,target:pipeline.target}}});
    try{
        pipeline.banner(manager);pipeline.banner(manager);
        manager.emit('nodeReady',{backend:{kind:'nodelink'}},{token:'private-token'});
        manager.emit('nodeError',{backend:{kind:'nodelink'}},Error('private-url'));
        await pipeline.close();
        const output=chunks.join('');
        assert.doesNotMatch(output,/private-|\x1b/);
        assert.equal(events.length,format==='silent'?0:2);
        if(format==='silent')assert.equal(output,'');
        else if(format==='json'){
            const records=output.trim().split('\n').map(JSON.parse);
            assert.deepEqual(records.map(r=>r.eventCode),['NODE_READY','NODE_ERROR']);
            assert.deepEqual(records.map(r=>r.level),[30,50]);
        }else{
            assert.equal((output.match(/Backend session ready/g)||[]).length,1);
            assert.equal((output.match(/Backend reported an error/g)||[]).length,1);
            assert.equal((output.match(/Version\s+/g)||[]).length,format==='aurora'?1:0);
        }
    }finally{await manager.shutdown();}
}

const customEvents=[];
const customTarget=Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(l=>[l,(record)=>customEvents.push(record)]));
const custom=createAuroraPipeline({format:'custom',target:customTarget});
const manager=new Manager({nodes:[{host:'localhost',port:2333,password:'fixture',secure:false}],options:{logging:{target:custom.target,level:custom.level}}});
try{manager.emit('nodeReady',{backend:{kind:'lavalink'}},{});assert.equal(customEvents.length,1);}finally{await manager.shutdown();await custom.close();}

const staticChunks=[];
const musicPipeline=createAuroraPipeline({format:'aurora',stream:new Writable({write(c,_e,done){staticChunks.push(c.toString());done();}})});
const endMusic=musicPipeline.startMusic({snapshot:()=>({state:'playing',positionMs:500,durationMs:1000})});
endMusic();await musicPipeline.close();
assert.match(staticChunks.join(''),/MUSIC PLAYING/);

const privateRecords=[];
const filtered=createAuroraPipeline({format:'custom',level:'warn',target:Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(l=>[l,e=>privateRecords.push(e)]))});
const safe={eventCode:'NODE_ERROR',severity:'error',timestamp:new Date().toISOString(),sanitizedContext:{backend:'nodelink',token:'private-token'},password:'private-password'};
filtered.target.info({...safe,eventCode:'NODE_READY',severity:'info'});
filtered.target.error(safe);
await filtered.close();
filtered.target.error(safe);
assert.equal(privateRecords.length,1);
assert.doesNotMatch(JSON.stringify(privateRecords),/private-/);
