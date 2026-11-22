const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {BackendDetector}=require('../dist');
const {createPlayer}=require('./helpers/player.cjs');
const {validateSourceHealth}=require('../dist/src/backends/NodeLinkContracts');
function report(enabled=false){
 return {enabled,timestamp:Date.now(),summary:{total:0,healthy:0,degraded:0,unavailable:0,rate_limited:0,restricted:0,misconfigured:0,idle:0,unknown:0},sources:{},probe:{enabled:false,intervalMs:0,nextRunAt:null,lastRunAt:null,running:false,currentSources:[],nextSources:[],eligibleSources:0}};
}
test('source health advertisement distinguishes endpoint support from enabled monitoring',()=>{
 const base={version:{semver:'3.10.0'},isNodelink:true};
 assert.equal(BackendDetector.detect(base).featureStatus('source-health'),'unknown');
 for(const enabled of [false,true]) assert.equal(BackendDetector.detect({...base,sourceHealth:{enabled}}).describeFeature('source-health').evidence,'advertised');
 assert.equal(BackendDetector.detect({version:{semver:'4.2.2'},sourceHealth:{enabled:true}}).supports('source-health'),false);
});
test('health wire validation permits disabled and idle source telemetry',()=>{
 assert.doesNotThrow(()=>validateSourceHealth(report()));
 const value=report(true);value.sources.youtube={status:'idle',successRate:100,reason:null,lastActivityAt:null};value.summary.total=1;value.summary.idle=1;
 assert.doesNotThrow(()=>validateSourceHealth(value));
 value.sources.youtube.successRate=101;
 assert.throws(()=>validateSourceHealth(value),{code:'INVALID_PROTOCOL_RESPONSE'});
});
test('health response and lyrics filters use the NodeLink HTTP extension router',async t=>{
 const {node}=createPlayer(t);const urls=[];let body=report();
 const server=http.createServer((req,res)=>{urls.push(req.url);res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url.startsWith('/v4/loadlyrics')?{loadType:'empty',data:{}}:body));});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 node.port=server.address().port;node.isNodeLink=true;node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});
 assert.equal((await node.getSourceHealth()).enabled,false);
 assert.equal(node.backend.featureStatus('source-health'),'available');
 await node.loadLyrics('opaque+track',{lang:'es',source:'youtube',type:'onlyCaptions'});
 await node.loadLyrics('legacy','en');
 const parsed=new URL(urls[1],'http://localhost');
 assert.equal(parsed.pathname,'/v4/loadlyrics');assert.equal(parsed.searchParams.get('encodedTrack'),'opaque+track');
 assert.equal(parsed.searchParams.get('lang'),'es');assert.equal(parsed.searchParams.get('source'),'youtube');assert.equal(parsed.searchParams.get('type'),'onlyCaptions');
 assert.equal(new URL(urls[2],'http://localhost').searchParams.get('lang'),'en');
 await assert.rejects(node.loadLyrics('opaque',{type:'audio'}),TypeError);
 assert.equal(urls.length,3);
 body={enabled:true};node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});
 await assert.rejects(node.getSourceHealth(),{code:'INVALID_PROTOCOL_RESPONSE'});
 assert.equal(node.backend.featureStatus('source-health'),'unknown');
});
test('Lavalink cannot route NodeLink health endpoint',async t=>{
 const {node}=createPlayer(t);
 await assert.rejects(node.getSourceHealth(),{code:'FEATURE_UNAVAILABLE'});
});
