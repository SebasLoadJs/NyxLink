'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Readable, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFileSync } = require('node:child_process');
const sdk = require('../dist');
const root = path.resolve(process.env.NYXLINK_NODELINK_PROPOSAL_ROOT || '.runtime/nodelink-proposal');
const expected = process.env.NYXLINK_NODELINK_PROPOSAL_REVISION;
const proposal = process.env.NYXLINK_NODELINK_PROPOSAL;
const revisions = Object.freeze({
  "265": "d0c3f9348a28d2e3fbc5e7f689cae6e86fadad9a",
  "266": "13c12ad1653436ed4ff96626d422f54ae65f4fca",
  "267": "e84a0a35958650d252461418123a5c82aef8395a",
  "268": "2f62c8b4d873636cff58062597f943ef9579a5b7",
  "269": "7df140312bf06214366b07c8a2a93acc93c76712",
  "270": "017c6cc7ae341ba105849647711fc90d552b1d76"
});
const moduleAt = file => import(pathToFileURL(path.join(root,'dist','src',file)).href);
function tone(ms, amplitude = 0.4, floating = false) {
  const frames = 48 * ms;
  const b = Buffer.alloc(frames * (floating ? 8 : 4));
  for (let i = 0; i < frames; i++) {
    const n = amplitude * Math.sin(2 * Math.PI * 440 * i / 48000);
    if (floating) { b.writeFloatLE(n, i * 8); b.writeFloatLE(n, i * 8 + 4); }
    else { const sample = Math.round(n * 32767); b.writeInt16LE(sample,i*4); b.writeInt16LE(sample,i*4+2); }
  }
  return b;
}
async function processBytes(transform, input) {
  const chunks = [];
  await pipeline(Readable.from([input]), transform, new Writable({write(chunk, _enc, callback) { chunks.push(Buffer.from(chunk)); callback(); }}));
  return Buffer.concat(chunks);
}
test('pinned NodeLink proposal module interoperability (no live Discord or provider claims)', async () => {
  assert.ok(Object.hasOwn(revisions,proposal),'Unknown proposal');
  assert.equal(expected,revisions[proposal],'Unapproved revision');
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),expected);
  switch (proposal) {
    case '265': {
      const {buildTrackMedia} = await moduleAt('modules/trackMedia.js');
      const raw = buildTrackMedia('spotify',{artists:[{name:'Fixture artist',artwork:[{url:'https://example.com/a.jpg',width:640}]}],album:{name:'Fixture album'},motionArtworkUrl:'https://example.com/a.mp4',identifiers:{isrc:'USABC1234567'},colors:{dark:'#123ABC'},credits:[{name:'Fixture artist',role:'composer'}]});
      const m = sdk.readNodeLinkMediaMetadata({media:raw});
      assert.equal(m.provider,'spotify'); assert.equal(m.artists[0].artwork[0].width,640);
      assert.equal(m.motionArtwork.url,'https://example.com/a.mp4'); assert.equal(m.identifiers.isrc,'USABC1234567');
      assert.equal(m.credits[0].role,'composer');
      break;
    }
    case '266': {
      const {buildPlaybackLyrics,activeLyricsIndices}=await moduleAt('modules/playbackLyrics.js');
      const {summarizeLyricsTiming}=await moduleAt('modules/lyricsTiming.js');
      const data={synced:true,lines:[{text:'Primary',time:100,duration:1000,words:[{text:'Primary',time:100,duration:1000}],alternatives:[{kind:'translation',text:'Principal',language:'es'}]},{text:'Harmony',time:200,duration:400,isBackground:true,agent:'v2'}]};
      assert.equal(summarizeLyricsTiming(data).granularity,'token');
      const lines=buildPlaybackLyrics(data);
      const raw={op:'event',type:'LyricsLineEvent',guildId:'123456789012345678',lineIndex:1,line:lines[1],activeLineIndices:activeLyricsIndices(lines,300)};
      const observed=sdk.readNodeLinkLyricsEvent(raw);
      assert.deepEqual(observed.activeLineIndices,[0,1]);assert.equal(observed.line.plugin.agent,'v2');
      const found=sdk.readNodeLinkLyricsEvent({op:'event',type:'LyricsFoundEvent',guildId:raw.guildId,lyrics:{text:'Primary\nHarmony',lines,synced:true}});
      assert.equal(found.lyrics.lines[0].plugin.alternatives[0].text,'Principal');
      break;
    }
    case '267': {
      const {AudioVisualization}=await moduleAt('playback/processing/AudioVisualization.js');
      const transform=new AudioVisualization(),input=tone(120);
      assert.deepEqual(await processBytes(transform,input),input);
      const result=sdk.readNodeLinkPlayerTelemetry({visualization:transform.snapshot()})?.visualization;
      assert.ok(result); assert.equal(result.sampleRate,48000);assert.equal(result.waveform.length,32);
      assert.equal(result.spectrum.length,8); assert.ok(result.rms[0]>0);assert.equal(result.rms[0],result.rms[1]);
      break;
    }
    case '268': {
      const {MusicAnalysis}=await moduleAt('playback/processing/MusicAnalysis.js');
      const transform=new MusicAnalysis(),input=tone(4000);
      assert.deepEqual(await processBytes(transform,input),input);
      const result=sdk.readNodeLinkPlayerTelemetry({musicAnalysis:transform.snapshot()})?.musicAnalysis;
      assert.ok(result,'SDK must accept actual NodeLink analysis snapshot');
      assert.equal(result.scope,'processed-output');assert.equal(result.analyzedMs,4000);
      assert.equal(result.outputWindowEndMs,4000);assert.ok(result.peak>0);
      break;
    }
    case '269': {
      const {ProtectedLimiterOutput}=await moduleAt('playback/processing/ProtectedAudioTransforms.js');
      const transform=new ProtectedLimiterOutput(()=>1);
      const input=tone(120,1.2,true);
      const output=await processBytes(transform,input);
      assert.equal(output.length,input.length/2);
      const result=sdk.readNodeLinkPlayerTelemetry({audioProcessing:transform.snapshot()})?.audioProcessing;
      assert.ok(result);assert.equal(result.requested_gain,1);assert.ok(result.max_gain_reduction_db>0);
      break;
    }
    case '270': {
      const {autoMixTrackKey,trailingSilenceStart,safeAutoMixEnd}=await moduleAt('playback/processing/autoMixSafety.js');
      const track={info:{sourceName:'youtube',identifier:'same',length:10000}};
      assert.notEqual(autoMixTrackKey(track),autoMixTrackKey({info:{...track.info,sourceName:'spotify'}}));
      assert.notEqual(autoMixTrackKey(track),autoMixTrackKey({...track,audioTrackId:'alternate'}));
      const points=Array.from({length:51},(_,i)=>({timestampMs:i*20,isSilence:i>=1}));
      assert.equal(trailingSilenceStart(points),20);
      assert.equal(trailingSilenceStart(points.map(p=>({...p,isSilence:true}))),null);
      assert.equal(safeAutoMixEnd(10000,null,false),10000);
      // Server-side safety helpers, not audible transition acceptance.
      break;
    }
  }
  console.log(JSON.stringify({proposal,revision:expected,scope:'actual pinned module interoperability; synthetic PCM/data; no Discord voice or provider credentials'}));
});
