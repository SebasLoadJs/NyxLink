const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { BackendDetector } = require('../dist');
const { createPlayer } = require('./helpers/player.cjs');

async function setup(t) {
  const { node } = createPlayer(t);
  node.isNodeLink = true;
  node.backend = BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});
  node.sessionId = 'test-session';
  const calls = [];
  const server = http.createServer(async (req,res) => {
    let body='';
    for await (const part of req) body += part;
    calls.push({method:req.method,url:req.url,body:JSON.parse(body)});
    res.writeHead(200, {'content-type':'audio/l16;rate=48000;channels=2'});
    res.end(Buffer.from([1,2,3,4,5,6]));
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(() => new Promise(resolve => {server.closeAllConnections();server.close(resolve);}));
  node.port=server.address().port;
  return {node,calls};
}

test('NodeLink LoadStream sends raw/wav rather than the obsolete pcm wire value', async t => {
  const {node,calls}=await setup(t);
  const inputs=['pcm','raw','wav'];
  for (const format of inputs) {
    const result=await node.rest.loadStream({encodedTrack:'local-test-audio',format,volume:100,position:0});
    assert.match(String(result.headers['content-type']),/audio\/l16/);
    let received=Buffer.alloc(0);
    for await (const chunk of result.stream) received=Buffer.concat([received,chunk]);
    assert.deepEqual(received,Buffer.from([1,2,3,4,5,6]));
  }
  assert.deepEqual(calls.map(c=>c.body.format),['raw','raw','wav']);
  assert.ok(calls.every(c=>c.url==='/v4/loadstream'&&c.method==='POST'));
  assert.ok(calls.every(c=>c.body.encodedTrack==='local-test-audio'));
});

test('invalid streaming requests fail before HTTP without marking the server unavailable',async t=>{
  const {node,calls}=await setup(t);
  const invalid=[
    {encodedTrack:''},{encodedTrack:null},{encodedTrack:'ok',format:'mp3'},
    {encodedTrack:'ok',volume:1001},{encodedTrack:'ok',volume:NaN},
    {encodedTrack:'ok',position:-1},{encodedTrack:'ok',filters:[]}
  ];
  for(const payload of invalid)await assert.rejects(node.rest.loadStream(payload),TypeError);
  assert.deepEqual(calls,[]);
  assert.equal(node.backend.featureStatus('loadstream'),'unknown');
});


test('opt-in PCM trim requests position zero and returns exactly the requested tail',async t=>{
  const {node,calls}=await setup(t);
  const response=await node.rest.loadStream({encodedTrack:'local-test-audio',format:'raw',position:0},
    {seekMode:'pcm-trim'});
  const chunks=[];
  for await(const chunk of response.stream) chunks.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(chunks),Buffer.from([1,2,3,4,5,6]));
  assert.deepEqual(calls[0].body,{encodedTrack:'local-test-audio',format:'raw',position:0});
});

test('optional PCM seek rejects WAV output and excess offsets before HTTP',async t=>{
  const {node,calls}=await setup(t);
  await assert.rejects(node.rest.loadStream({encodedTrack:'x',format:'wav',position:500},{seekMode:'pcm-trim'}),TypeError);
  for(const position of [0.5,30001]) {
    await assert.rejects(node.rest.loadStream({encodedTrack:'x',format:'raw',position},{seekMode:'pcm-trim'}),RangeError);
  }
  await assert.rejects(node.rest.loadStream({encodedTrack:'x',position:500},{seekMode:'unknown'}),TypeError);
  assert.equal(calls.length,0);
});

test('client PCM trim does not pretend a too-short server stream was valid',async t=>{
  const {node,calls}=await setup(t);
  const response=await node.rest.loadStream({encodedTrack:'x',format:'raw',position:1},{seekMode:'pcm-trim'});
  const drain=async()=>{for await(const chunk of response.stream){}};
  await assert.rejects(drain(),{code:'PCM_SEEK_BEYOND_SOURCE'});
  assert.equal(calls[0].body.position,0);
  assert.equal(calls[0].body.format,'raw');
});

test('Node.loadDirectStream forwards opt-in client seek options',async t=>{
  const {node,calls}=await setup(t);
  const response=await node.loadDirectStream('encoded',100,0,undefined,{seekMode:'pcm-trim'});
  for await(const _ of response.stream){}
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.position,0);
  assert.equal(calls[0].body.format,'raw');
});
