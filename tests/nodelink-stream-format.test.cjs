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
