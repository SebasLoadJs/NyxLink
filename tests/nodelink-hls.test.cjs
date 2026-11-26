const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {BackendDetector}=require('../dist');
const {createPlayer}=require('./helpers/player.cjs');
const manifest=id=>'#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-MAP:URI="init.mp4?sessionId='+id+'"\n#EXTINF:4.000,\nsegment.m4s?sessionId='+id+'&segment=0\n#EXT-X-ENDLIST\n';
async function setup(t,handler){
 const {node}=createPlayer(t),calls=[];
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');calls.push({url,auth:req.headers.authorization});handler(url,res);});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 node.port=server.address().port;node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});node.isNodeLink=true;
 return {node,calls};
}
test('HLS native manifest and binary fragments use isolated session and exact routes',async t=>{
 const {node,calls}=await setup(t,(url,res)=>{
  const id=url.searchParams.get('sessionId');
  if(url.pathname.endsWith('playlist.m3u8')){res.writeHead(200,{'content-type':'application/vnd.apple.mpegurl; charset=utf-8'});res.end(manifest(id));}
  else {res.writeHead(200,{'content-type':url.pathname.endsWith('init.mp4')?'video/mp4':'video/iso.segment'});res.end(Buffer.from([0,255,128,7]));}
 });
 const first=await node.rest.createHlsSession('fixture+/=',{volume:90,segmentDuration:4});
 assert.match(first.sessionId,/^[a-z0-9-]+$/);assert.equal(first.playlist,manifest(first.sessionId));
 assert.notEqual((await node.rest.createHlsSession('fixture+/=')).sessionId,first.sessionId);
 assert.deepEqual(await node.rest.getHlsPlaylist(first.sessionId),first);
 assert.deepEqual(await node.rest.getHlsInitSegment(first.sessionId),Buffer.from([0,255,128,7]));
 assert.deepEqual(await node.rest.getHlsSegment(first.sessionId,0),Buffer.from([0,255,128,7]));
 assert.equal(calls[0].url.searchParams.get('encodedTrack'),'fixture+/=');
 assert.ok(calls.every(x=>x.auth==='test-only'));
 assert.equal(node.backend.featureStatus('hls'),'available');
});
test('HLS rejects forged URIs, invalid parameters and non-native backends',async t=>{
 const {node,calls}=await setup(t,(url,res)=>{res.writeHead(200,{'content-type':'application/vnd.apple.mpegurl'});res.end(manifest(url.searchParams.get('sessionId')).replace('segment.m4s?','https://other.invalid/segment.m4s?'));});
 await assert.rejects(node.rest.createHlsSession('fixture'),{code:'INVALID_PROTOCOL_RESPONSE'});
 assert.equal(node.backend.featureStatus('hls'),'unknown');
 await assert.rejects(node.rest.getHlsPlaylist('../bad'),TypeError);
 assert.throws(()=>node.rest.getHlsSegment('valid',-1),TypeError);
 node.backend=BackendDetector.detect({version:{semver:'4.2.2'}});node.isNodeLink=false;
 await assert.rejects(node.rest.createHlsSession('fixture'),{code:'FEATURE_UNAVAILABLE'});
 assert.equal(calls.length,1);
});
