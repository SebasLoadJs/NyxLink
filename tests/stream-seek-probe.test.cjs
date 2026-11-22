const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { probeLoadStream } = require('./helpers/stream-seek-probe.cjs');

async function serverFor(t, handler) {
  const server = http.createServer(handler);
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return {host:'127.0.0.1', port:server.address().port,password:'local',secure:false};
}

test('seek framing probe records complete 206 responses without leaking encoded tracks', async t => {
  let request;
  const backend = await serverFor(t, async (req,res) => {
    let body='';for await(const part of req)body+=part;
    request={method:req.method,url:req.url,range:req.headers.range,auth:req.headers.authorization,body:JSON.parse(body)};
    res.writeHead(206,{'content-range':'bytes 4-11/12','content-length':'8'});
    res.end(Buffer.from('abcdefgh'));
  });
  const result=await probeLoadStream(backend,'test-session','secret-encoded-track',
    {name:'raw-range',format:'raw',position:0,range:'bytes=4-'});
  assert.deepEqual({status:result.statusCode,bytes:result.bytes,complete:result.complete,
    range:result.contentRange,length:result.contentLength,nonzero:result.nonzeroBytes},
    {status:206,bytes:8,complete:true,range:'bytes 4-11/12',length:8,nonzero:8});
  assert.equal(result.errorCode,null);
  assert.equal(result.ended,true);
  assert.equal(request.auth,'local');
  assert.equal(request.method,'POST');
  assert.equal(request.range,'bytes=4-');
  assert.equal(request.body.encodedTrack,'secret-encoded-track');
  assert.ok(!JSON.stringify(result).includes('secret-encoded-track'));
  assert.ok(!JSON.stringify(result).includes('local'));
});

test('seek framing probe keeps short Content-Length and aborted stream as failed evidence', async t => {
  const backend=await serverFor(t, (_req,res)=>{
    res.writeHead(200,{'content-type':'audio/l16','content-length':128});
    res.write(Buffer.alloc(20,42));
    setImmediate(()=>res.socket?.destroy());
  });
  const result=await probeLoadStream(backend,'sess','encoded',
    {name:'raw-position',format:'raw',position:500});
  assert.equal(result.statusCode,200);
  assert.equal(result.contentLength,128);
  assert.equal(result.bytes,20);
  assert.equal(result.complete,false);
  assert.equal(result.ended,false);
  assert.ok(result.errorCode || result.aborted);
});

test('seek framing probe forbids external destinations and malformed Range inputs',async()=>{
  await assert.rejects(probeLoadStream({host:'example.com',port:443,password:'x'},
    'session','audio',{name:'bad',format:'raw',position:0}),TypeError);
  await assert.rejects(probeLoadStream({host:'127.0.0.1',port:443,password:'x'},
    'session','audio',{name:'bad',format:'raw',position:0,range:'bytes=0-1\\r\\nCookie: x'}),TypeError);
  await assert.rejects(probeLoadStream({host:'127.0.0.1',port:443,password:'x'},
    'session','audio',{name:'bad',format:'mp3',position:0}),TypeError);
});
