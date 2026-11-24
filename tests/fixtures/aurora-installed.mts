import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { Manager, AuroraInspectorStore } from 'nyxlink';
import { createAuroraPipeline } from 'nyxlink/aurora';
import { runAuroraBootstrap } from 'nyxlink/aurora/bootstrap';
import { startInspector, traceRows } from 'nyxlink/aurora/inspector';
import { capabilityTable } from 'nyxlink/aurora/diagnostics';
import { activeTraceContext } from 'nyxlink/aurora/otel';
import { createHostSDK } from 'nyxlink/aurora/sdk';
const lines:string[]=[];
const stream=new Writable({write(chunk,_encoding,done){lines.push(chunk.toString());done();}});
const pipeline=createAuroraPipeline({format:'json',level:'debug',stream});
const manager=new Manager({nodes:[{host:'localhost',port:2333,password:'fixture',secure:false}],options:{logging:{level:pipeline.level,target:pipeline.target}}});
try {
    manager.emit('nodeReady',{backend:{kind:'nodelink'}} as import('nyxlink').Node,{token:'PRIVATE_CANARY'});
    assert.equal(typeof runAuroraBootstrap,'function');assert.equal(typeof startInspector,'function');
    assert.equal(typeof traceRows,'function');assert.equal(typeof createHostSDK,'function');
    assert.equal(activeTraceContext(),undefined);
    assert.equal(typeof capabilityTable(new AuroraInspectorStore(manager).snapshot().nodes),'string');
    assert.equal(await pipeline.close(),true);
    const records=lines.join('').trim().split('\n').map(x=>JSON.parse(x));
    assert.equal(records.length,1);assert.equal(records[0].eventCode,'NODE_READY');
    assert.doesNotMatch(lines.join(''),/PRIVATE_CANARY|\x1b/);
}finally{await manager.shutdown();await pipeline.close();}
