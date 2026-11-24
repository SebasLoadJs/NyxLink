import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { Manager } from 'nyxlink';
import { createAuroraPipeline } from './aurora-pipeline.mjs';
for(const format of ['silent','json','pretty','aurora']){
    const chunks=[],events=[];
    const stream=new Writable({write(chunk,_encoding,done){chunks.push(chunk.toString());done();}});
    const pipeline=createAuroraPipeline({format,level:format==='silent'?'silent':'debug',stream,onEvent:e=>events.push(e)});
    const manager=new Manager({nodes:[{host:'localhost',port:2333,password:'private-password',secure:false}],options:{aurora:{level:pipeline.level,target:pipeline.target}}});
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
