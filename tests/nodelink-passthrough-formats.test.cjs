const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { BackendDetector } = require('../dist');
const { createPlayer } = require('./helpers/player.cjs');

const catalogue = {
  source:'http', protocol:'http', format:null,
  mimeType:'application/octet-stream', itag:null,
  seekable:true, byteRangeSupported:true,
  formats:[{
    itag:null, type:'audio', format:null, codec:null,
    mimeType:'application/octet-stream', bitrate:null,
    quality:null, width:null, height:null, fps:null, contentLength:null,
  }],
};

async function setup(t, reply) {
  const {node}=createPlayer(t);
  node.isNodeLink=true;
  node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});
  node.sessionId='format-lab';
  const calls=[];
  const server=http.createServer(async (req,res)=>{
    let text='';for await(const part of req)text+=part;
    calls.push({path:req.url,method:req.method,headers:req.headers,body:JSON.parse(text)});
    await reply(req,res);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}));
  node.port=server.address().port;
  return {node,calls};
}

test('getStreamFormats returns validated JSON, never PCM bytes',async t=>{
  const {node,calls}=await setup(t,(_req,res)=>{
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify(catalogue));
  });
  const formatList=await node.getStreamFormats('test-audio',{itag:251});
  assert.deepEqual(formatList,catalogue);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].body,{encodedTrack:'test-audio',format:'formats',itag:251});
  assert.equal(calls[0].path,'/v4/loadstream');
  assert.equal(node.backend.featureStatus('loadstream'),'available');
});

test('format catalogue rejects spoofed nested metadata',async t=>{
  const {node}=await setup(t,(_req,res)=>{
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({...catalogue,formats:[{...catalogue.formats[0],type:'dangerous'}]}));
  });
  await assert.rejects(node.getStreamFormats('test-audio'),/NodeLink stream formats/);
});

test('unsupported old server reports explicit 400 and does not poison NodeLink feature availability',async t=>{
  const {node}=await setup(t,(_req,res)=>{
    res.writeHead(400,{'content-type':'application/json'});
    res.end(JSON.stringify({message:'Unsupported output format'}));
  });
  await assert.rejects(node.getStreamFormats('test-audio'),error=>error.statusCode===400);
  assert.equal(node.backend.featureStatus('loadstream'),'unknown');
});

test('passthrough preserves original bytes and forwards one validated HTTP byte range',async t=>{
  const original=Buffer.from('not-PCM-stream-original-bytes');
  const {node,calls}=await setup(t,(_req,res)=>{
    res.writeHead(206,{'content-type':'audio/mpeg','content-range':'bytes 2-9/24','content-length':String(original.length),'x-nodelink-passthrough':'true'});
    res.end(original);
  });
  const reply=await node.loadSourceStream('encoded',{itag:140,range:'bytes=2-9'});
  const chunks=[];for await(const chunk of reply.stream)chunks.push(chunk);
  assert.equal(reply.statusCode,206);
  assert.equal(reply.headers['content-range'],'bytes 2-9/24');
  assert.deepEqual(Buffer.concat(chunks),original);
  assert.equal(calls[0].headers.range,'bytes=2-9');
  assert.deepEqual(calls[0].body,{encodedTrack:'encoded',format:'passthrough',itag:140});
});

test('old client aliases normalize to source passthrough on wire',async t=>{
  const {node,calls}=await setup(t,(_req,res)=>{res.writeHead(200,{'content-type':'audio/mpeg','x-nodelink-passthrough':'true'});res.end(Buffer.from('data'))});
  for(const format of ['passthrough','original','source']){
    const out=await node.rest.loadStream({encodedTrack:'encoded',format});
    for await(const _ of out.stream){}
  }
  assert.deepEqual(calls.map(c=>c.body.format),['passthrough','passthrough','passthrough']);
});

test('reject malformed ranges, invalid itags and PCM-trim of compressed data before network',async t=>{
  const {node,calls}=await setup(t,(_req,res)=>{res.end(Buffer.alloc(0))});
  const invalid=[
    [{encodedTrack:'x',format:'passthrough',itag:1.5},{}],
    [{encodedTrack:'x',format:'raw',itag:2},{}],
    [{encodedTrack:'x',format:'passthrough'},{range:'bytes=1-2\\r\\nAuthorization: attacker'}],
    [{encodedTrack:'x',format:'passthrough'},{range:'bytes=1-2,3-4'}],
    [{encodedTrack:'x',format:'raw'},{range:'bytes=2-'}],
    [{encodedTrack:'x',format:'passthrough',position:100},{seekMode:'pcm-trim'}],
    [{encodedTrack:'x',format:'formats'},{}],
  ];
  for(const [payload,options] of invalid){
    await assert.rejects(node.rest.loadStream(payload,options),TypeError);
  }
  for(const itag of [0,-1,1.2]){
    await assert.rejects(node.getStreamFormats('track',{itag}),TypeError);
  }
  assert.deepEqual(calls,[]);
});


test('legacy NodeLink returning PCM for passthrough is rejected rather than misidentified', async t=>{
  const {node,calls}=await setup(t,(_req,res)=>{
    res.writeHead(200,{'content-type':'audio/l16;rate=48000;channels=2'});
    res.end(Buffer.alloc(192));
  });
  await assert.rejects(node.loadSourceStream('encoded'),/passthrough confirmation header/);
  assert.equal(calls[0].body.format,'passthrough');
  assert.notEqual(node.backend.featureStatus('loadstream'),'available');
});

test('200 JSON/HTML responses are not silently passed to PCM or WAV decoders',async t=>{
  for(const mediaType of ['application/json','application/problem+json','text/html','text/plain']){
    const {node}=await setup(t,(_req,res)=>{
      res.writeHead(200,{'content-type':mediaType});
      res.end('{"message":"not actually audio"}');
    });
    await assert.rejects(node.rest.loadStream({encodedTrack:'encoded',format:'raw'}),/unexpected streaming Content-Type/);
    await assert.rejects(node.rest.loadStream({encodedTrack:'encoded',format:'wav'}),/unexpected streaming Content-Type/);
  }
});

test('raw and wav formats cannot be swapped by a successful HTTP status',async t=>{
  const {node}=await setup(t,(req,res)=>{
    res.writeHead(200,{'content-type':req.headers['x-test-format']||'audio/wav'});
    res.end(Buffer.alloc(44));
  });
  await assert.rejects(node.rest.loadStream({encodedTrack:'encoded',format:'raw'}),/expected 48kHz stereo raw PCM/);
});

test('source passthrough requires modern NodeLink marker even with compressed audio MIME',async t=>{
  const {node}=await setup(t,(_req,res)=>{
    res.writeHead(206,{'content-type':'audio/mpeg'});
    res.end(Buffer.from('ABCD'));
  });
  await assert.rejects(node.loadSourceStream('encoded',{range:'bytes=2-5'}),/passthrough confirmation header/);
});
