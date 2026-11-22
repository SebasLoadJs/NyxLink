'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { Manager } = require('../dist');
const { event } = require('../tests/helpers/v4-server.cjs');
const { withBackendLab } = require('../tests/helpers/backend-lab.cjs');
const { streamAudio } = require('../tests/helpers/pcm-evidence.cjs');
const { probeLoadStream } = require('../tests/helpers/stream-seek-probe.cjs');

function frequency(pcm, durationMs = 250) {
  const frames = Math.min(Math.floor(durationMs * 48), Math.floor(pcm.length / 4));
  if (frames < 4800) throw new Error('Not enough PCM to analyze frequency');
  let positiveEdges = 0;
  let previous = pcm.readInt16LE(0);
  for (let i = 1; i < frames; i++) {
    const current = pcm.readInt16LE(i * 4);
    if (previous <= 0 && current > 0) positiveEdges++;
    previous = current;
  }
  return positiveEdges / (frames / 48000);
}

(async () => {
  const checks = [];
  let result = { passed: false, checks, scope:'NodeLink server WAV seek patch; no Discord voice' };
  try {
    if (process.env.NYXLINK_NODELINK_PROFILE !== 'patched') {
      throw new Error('This acceptance must use the immutable-local patched NodeLink profile');
    }
    await withBackendLab(async lab => {
      const backend = lab.backends.find(x => x.kind === 'nodelink');
      const manager = new Manager({
        nodes:[backend],
        send(){throw new Error('Discord gateway not allowed');},
        options:{database:{type:'memory'},resume:false}
      });
      manager.on('nodeError',()=>{});
      try {
        const ready = event(manager,'nodeReady',15000);
        await manager.init('823456789012345678');
        const [node] = await ready;
        const loaded = await node.rest.loadTracks(lab.seekMediaUrl);
        assert.equal(loaded.loadType,'track');
        assert.equal(loaded.data.info.sourceName,'http');
        const encoded=loaded.data.encoded;
        assert.equal(loaded.data.info.length,-1,'HTTP source must still report unknown original duration');

        const entire=await streamAudio(node.rest,encoded,{format:'raw',position:0});
        const seeked=await streamAudio(node.rest,encoded,{format:'raw',position:500});
        assert.ok(entire.evidence.bytes >= 550000 && entire.evidence.bytes <= 590000,
          'Full 3s decoded source size must be plausible');
        assert.equal(entire.evidence.bytes-seeked.evidence.bytes,96000,
          'Native NodeLink seek must return precisely 500ms fewer PCM bytes');
        assert.ok(seeked.evidence.nonZero>5000,'Native seek must preserve non-silent PCM');

        const before=frequency(entire.pcm);
        const after=frequency(seeked.pcm);
        assert.ok(before > 410 && before < 470,'Pre-seek fixture must contain 440Hz; got '+before);
        assert.ok(after > 820 && after < 940,'Native seek must begin in 880Hz segment; got '+after);
        checks.push({kind:'unknown-duration raw PCM',bytesRemoved:96000,beforeHz:before,afterHz:after});

        const wavSeek=await streamAudio(node.rest,encoded,{format:'wav',position:500});
        assert.equal(wavSeek.evidence.bytes,seeked.evidence.bytes,
          'Native WAV and raw seek must have same PCM length');
        assert.ok(frequency(wavSeek.pcm)>820,'WAV output must begin after tone transition');
        checks.push({kind:'unknown-duration WAV',outputBytes:wavSeek.data.length,complete:true});

        const encodedKnown = await node.rest.encodeTracksRemote([{encoded,info:{
          ...loaded.data.info,length:3000,isStream:false,isSeekable:true,position:0,details:[]
        }}]);
        assert.ok(Array.isArray(encodedKnown) && typeof encodedKnown[0]==='string');
        const knownWav=await probeLoadStream(backend,node.sessionId,encodedKnown[0],
          {name:'known-wav-pos500',format:'wav',position:500});
        assert.equal(knownWav.statusCode,200);
        assert.equal(knownWav.contentLength,480044);
        assert.equal(knownWav.bytes,480044);
        assert.equal(knownWav.complete,true);
        assert.equal(knownWav.errorCode,null);
        checks.push({kind:'finite-duration WAV',status:200,contentLength:knownWav.contentLength});

        const ranged=await probeLoadStream(backend,node.sessionId,encodedKnown[0],
          {name:'known-raw-range',format:'raw',position:0,range:'bytes=96000-'});
        assert.equal(ranged.statusCode,206);
        assert.equal(ranged.contentLength,480000);
        assert.equal(ranged.bytes,480000);
        assert.equal(ranged.complete,true);
        assert.equal(ranged.errorCode,null);
        assert.match(String(ranged.contentRange),/^bytes 96000-575999\/576000$/);
        checks.push({kind:'finite-duration raw HTTP Range',status:206,bytes:ranged.bytes});

        result={...result,passed:true,version:backend.version,image:backend.image};
      } finally {await manager.shutdown();}
    },{streaming:true,mix:false});
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  await fs.mkdir('.runtime/extensions',{recursive:true});
  await fs.writeFile('.runtime/extensions/nodelink-wav-seek-repair-report.json',
    JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  if(!result.passed)process.exitCode=1;
})().catch(err=>{console.error(err);process.exitCode=1});
