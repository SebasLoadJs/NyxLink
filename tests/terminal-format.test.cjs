const test=require('node:test');
const assert=require('node:assert/strict');
const {AuroraPresentation,normalizeAuroraEvent,diagnoseError,HttpError}=require('../dist');
const {formatBox,formatSystemStatus}=require('../dist/src/logging/LogFormatter');
const strip=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
const paint=s=>'\x1b[95m'+s+'\x1b[0m';
const tools={figlet:s=>s,gradient:paint,paint,box:s=>s,width:s=>strip(s).length,strip,duration:n=>n+'ms',symbols:{info:'i',success:'+',warning:'!',error:'x'}};
const dashboard=(context={})=>normalizeAuroraEvent({eventCode:'DASHBOARD_SNAPSHOT',timestamp:'2026-01-01T12:00:00.000Z',sanitizedContext:context});
test('canonical cluster panel uses observed aggregate counts, including zero, without invented health',()=>{
 const view=new AuroraPresentation(tools,{columns:60,color:false});
 const text=view.event(dashboard({nodeCount:1,playerCount:2,playingCount:1,queuedTracks:3,sourceCount:0,nodeId:'PRIVATE_CANARY'}));
 assert.match(text,/Cluster dashboard observed/);assert.match(text,/Nodes: 1/);assert.match(text,/Players: 2/);
 assert.match(text,/Sources: 0/);assert.doesNotMatch(text,/PRIVATE_CANARY|HEALTHY|RECOVERED/);
});
test('malformed dashboard fields are omitted, not invented',()=>{
 const event=dashboard({nodeCount:NaN,playerCount:-1,playingCount:'unknown',sourceCount:Infinity,queuedTracks:0});
 assert.deepEqual(event.sanitizedContext,{backend:'unknown',queuedTracks:0});
 const output=new AuroraPresentation(tools,{columns:80}).event(event);
 assert.match(output,/Queue: 0/);assert.doesNotMatch(output,/Nodes:|Players:|Playing:|Sources:/);
});
test('typed error diagnostics retain actual error code and retry advice, without credentials',()=>{
 const diagnostic=diagnoseError(new HttpError(429),{token:'PRIVATE_CANARY',traceId:'trace-1'});
 assert.match(diagnostic.action,/retry delay/);assert.equal(diagnostic.context.traceId,'trace-1');
 assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE_CANARY/);
});
test('pure panels respect narrow widths and non-finite widths cannot crash formatting',()=>{
 for(const panel of [formatBox('A long title for a narrow terminal',{values:'x'.repeat(100)},20),formatSystemStatus([],{width:20})])
  assert.ok(panel.split('\n').every(line=>[...line].length<=20));
 assert.doesNotThrow(()=>formatBox('safe',{},Infinity));assert.doesNotThrow(()=>formatSystemStatus([],{width:NaN}));
});
test('dashboard respects terminal widths, no-color, ASCII and canonical event metadata',()=>{
 const record=dashboard({nodeCount:2,playerCount:2,playingCount:1,queuedTracks:7,sourceCount:0});
 for(const columns of [40,80,120]){
   const text=new AuroraPresentation(tools,{columns,color:false,isTTY:false,unicode:false}).event(record);
   assert.match(text,/INFO/);assert.match(text,/TELEMETRY/);assert.match(text,/Queue: 7/);
   assert.doesNotMatch(text,/\x1b\[/);assert.ok(text.split('\n').every(line=>line.length<=columns));
 }
});
