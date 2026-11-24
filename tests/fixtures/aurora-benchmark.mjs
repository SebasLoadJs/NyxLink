import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Writable } from 'node:stream';
import { writeFileSync } from 'node:fs';
import { Manager } from 'nyxlink';
import { createAuroraPipeline } from './aurora-pipeline.mjs';

const count=2000;
const samples=[];
for(const format of ['disabled','silent','json','pretty','aurora']){
    for(let repeat=0;repeat<3;repeat++){
        let records=0,bytes=0,received=0,renderErrors=0;
        const stream=new Writable({write(chunk,_encoding,done){
            bytes+=chunk.length;
            records+=(chunk.toString().match(/Tracks queued/g)||[]).length;
            done();
        }});
        const pipeline=format==='disabled'?undefined:createAuroraPipeline({format,level:format==='silent'?'silent':'debug',stream,onEvent(){received++;},onRenderError(){renderErrors++;}});
        const manager=new Manager({nodes:[{host:'localhost',port:2333,password:'fixture',secure:false}],options:pipeline?{logging:{level:pipeline.level,target:pipeline.target}}:{}});
        const player={node:{backend:{kind:'nodelink'}}};
        try{
            for(let i=0;i<100;i++)manager.emit('queueAdd',player,[{}]);
            records=bytes=received=renderErrors=0;
            const start=performance.now();
            for(let i=0;i<count;i++)manager.emit('queueAdd',player,[{}]);
            await pipeline?.close();
            const elapsedMs=performance.now()-start;
            const active=!['disabled','silent'].includes(format);
            assert.equal(received,active?count:0,format+' event count');
            assert.equal(records,active?count:0,format+' rendered count');
            assert.equal(renderErrors,0);
            samples.push({format,repeat,count,elapsedMs,eventsPerSecond:count*1000/Math.max(elapsedMs,0.001),bytes,received,records,rejected:pipeline?.terminal?.stats.rejected??0});
        }finally{await manager.shutdown();await pipeline?.close();}
    }
}
writeFileSync(process.argv[2],JSON.stringify({node:process.version,platform:process.platform,scope:'synthetic synchronous writable; no Discord or real backend',samples},null,2)+'\n');
