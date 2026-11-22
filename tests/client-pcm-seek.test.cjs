const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const {
  PCM_BYTES_PER_MS, MAX_CLIENT_PCM_SEEK_MS,
  assertClientPcmSeekPosition, createClientPcmSeekStream,
} = require('../dist/src/backends/ClientPCMSeek');

async function collect(stream) {
  const parts = [];
  for await (const part of stream) parts.push(Buffer.from(part));
  return Buffer.concat(parts);
}

test('client PCM seek discards exact S16LE stereo frames across arbitrary chunks', async () => {
  assert.equal(PCM_BYTES_PER_MS, 192);
  const source = Readable.from([Buffer.alloc(100,1),Buffer.alloc(150,2),Buffer.alloc(100,3)]);
  const output = await collect(createClientPcmSeekStream(source,1));
  assert.equal(output.length,158);
  assert.deepEqual(output,Buffer.concat([Buffer.alloc(58,2),Buffer.alloc(100,3)]));
});

test('PCM seek zero keeps the entire input unchanged', async () => {
  const audio=Buffer.from([1,2,3,4,5,6,7,8]);
  assert.deepEqual(await collect(createClientPcmSeekStream(Readable.from([audio]),0)),audio);
});

test('PCM seek rejects non-integer, negative and excessive offset before touching source',()=>{
  for(const value of [-1,0.1,NaN,Infinity,-Infinity,30001]) {
    assert.throws(()=>assertClientPcmSeekPosition(value),RangeError);
  }
  assert.doesNotThrow(()=>assertClientPcmSeekPosition(MAX_CLIENT_PCM_SEEK_MS));
});

test('PCM seek rejects EOF when the requested offset exceeds decoded duration',async()=>{
  const source=Readable.from([Buffer.alloc(160)]);
  await assert.rejects(collect(createClientPcmSeekStream(source,1)),{
    code:'PCM_SEEK_BEYOND_SOURCE'
  });
});

test('PCM seek never hides upstream decoding errors behind valid audio',async()=>{
  const source=Readable.from((async function*(){
    yield Buffer.alloc(600,5);
    throw Object.assign(new Error('decoder aborted'),{code:'ECONNRESET'});
  })());
  await assert.rejects(collect(createClientPcmSeekStream(source,1)),error=>{
    assert.match(error.message,/decoder aborted/);
    return true;
  });
});

test('consumer cancellation closes source decoding and releases resources',async()=>{
  const source=new Readable({
    read(){this.push(Buffer.alloc(384));}
  });
  const output=createClientPcmSeekStream(source,2);
  await new Promise((resolve,reject)=>{
    output.once('data',()=>{output.destroy();resolve();});
    output.once('error',reject);
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(source.destroyed,true);
});
