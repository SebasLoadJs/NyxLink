const test = require('node:test');
const assert = require('node:assert/strict');
const { BackendDetector, Rest } = require('../dist');
const { createPlayer } = require('./helpers/player.cjs');
const http = require('node:http');
const { once } = require('node:events');

const adapter = kind => BackendDetector.detect({version:{semver:kind==='nodelink'?'3.10.0':'4.2.2'},isNodelink:kind==='nodelink'});

test('common v4 endTime and plugin fields are available with both adapters',()=>{
  for(const kind of ['lavalink','nodelink']){
    const backend=adapter(kind);
    assert.deepEqual(backend.preparePlayerUpdate({endTime:120000,customPlugin:{enabled:true}}),{endTime:120000,customPlugin:{enabled:true}});
    assert.deepEqual(backend.preparePlayerUpdate({endTime:null}),{endTime:null});
  }
});

test('explicit null and false NodeLink options are rejected on Lavalink',()=>{
  const backend=adapter('lavalink');
  for(const patch of [{nextTrack:null},{loudnessNormalizer:false},{fading:{enabled:false}},{track:{audioTrackId:''}}]){
    assert.throws(()=>backend.preparePlayerUpdate(patch),{code:'FEATURE_UNAVAILABLE'});
  }
});

test('known unavailable NodeLink features cannot be requested',()=>{
  const backend=adapter('nodelink');
  backend.recordFeature('nextTrack','unavailable');
  assert.throws(()=>backend.preparePlayerUpdate({nextTrack:null}),{code:'FEATURE_UNAVAILABLE'});
  assert.deepEqual(backend.preparePlayerUpdate({loudnessNormalizer:false}),{loudnessNormalizer:false});
});

test('voice normalization does not mutate the caller payload',()=>{
  const backend=adapter('nodelink');
  const payload={voice:{token:'test',sessionId:'session',endpoint:'example.invalid'}};
  assert.equal(backend.preparePlayerUpdate(payload,'channel').voice.channelId,'channel');
  assert.equal(payload.voice.channelId,undefined);
  assert.throws(()=>backend.preparePlayerUpdate({voice:{token:'test'}}),/voice payload requires/);
});

test('Player sends endTime to Lavalink and rejects unsupported next-track clearing',async t=>{
  const {player,node,requests}=createPlayer(t);
  node.backend=adapter('lavalink');
  await player.updatePlayer({endTime:90000});
  assert.equal(requests[0].payload.endTime,90000);
  await assert.rejects(player.updatePlayer({nextTrack:null}),{code:'FEATURE_UNAVAILABLE'});
  assert.equal(requests.length,1);
});

test('direct REST calls apply the same adapter policy before issuing HTTP',async t=>{
  const {node,player}=createPlayer(t);
  let calls=0;
  const server=http.createServer(async(req,res)=>{
    calls++;let body='';for await(const part of req) body+=part;
    res.setHeader('content-type','application/json');res.end(body);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  node.port=server.address().port;
  node.backend=adapter('lavalink');
  const rest=new Rest(node);
  await assert.rejects(rest.updatePlayer(player.guildId,{nextTrack:null}),{code:'FEATURE_UNAVAILABLE'});
  assert.equal(calls,0);
  assert.deepEqual(await rest.updatePlayer(player.guildId,{endTime:null}),{endTime:null});
  assert.equal(calls,1);
});
