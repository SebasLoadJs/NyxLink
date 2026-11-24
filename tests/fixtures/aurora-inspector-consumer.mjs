import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { Inspector, startInspector, traceRows, exportInspectorReport } from './aurora-inspector.mjs';
import { Writable } from 'node:stream';

const source = { snapshot: () => ({
    source:'simulated',nodes:[{alias:'NODE-01',backend:'nodelink',ready:true,capabilities:[]}],
    players:[{alias:'PLAYER-01',backend:'nodelink',state:'paused'}],
    events:[{code:'NODE_READY',level:'info',category:'NODE',backend:'nodelink',message:'Backend session ready'}],
    spans:[{name:'nyxlink.search',traceId:'a'.repeat(32),spanId:'b'.repeat(16),durationMs:12,outcome:'ok'}],
}) };
for (const [tab, pattern] of [['Overview',/Nodes: 1\/1 ready/],['Nodes',/NODE-01/],['Players',/PLAYER-01/],['Events',/NODE_READY/],['Traces',/nyxlink.search/]]) {
    const app = render(React.createElement(Inspector,{source,initialTab:tab,interactive:false}));
    try { assert.match(app.lastFrame(),/SIMULATED/); assert.match(app.lastFrame(),pattern); }
    finally { app.unmount(); app.cleanup(); }
}
const chunks=[];
const stdout=new Writable({write(chunk,_encoding,done){chunks.push(chunk.toString());done();}});
assert.equal(startInspector(source,{stdout,stdin:{isTTY:false}}),undefined);
assert.match(chunks.join(''),/SIMULATED/);
assert.doesNotMatch(chunks.join(''),/\x1b/);

const traces=[{name:'nyxlink.search',traceId:'a',spanId:'1',startTimeMs:100,durationMs:20},{name:'nyxlink.rest',traceId:'a',spanId:'2',parentSpanId:'1',startTimeMs:105,durationMs:5}];
assert.deepEqual(traceRows(traces,'a'),['nyxlink.search +0ms / 20ms','  nyxlink.rest +5ms / 5ms']);
assert.match(traceRows([traces[1]],'a')[0],/parent not retained/);
const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aurora-report-'));
try{
 const report=path.join(dir,'report.json');
 await exportInspectorReport(source,report);
 const data=JSON.parse(await fs.readFile(report,'utf8'));
 assert.equal(data.schemaVersion,1);assert.equal(data.source,'simulated');
 await assert.rejects(exportInspectorReport(source,report),{code:'EEXIST'});
}finally{await fs.rm(dir,{recursive:true,force:true});}
