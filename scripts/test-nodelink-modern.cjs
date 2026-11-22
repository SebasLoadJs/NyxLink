const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { Manager } = require('../dist');
const { event } = require('../tests/helpers/v4-server.cjs');
const { withBackendLab } = require('../tests/helpers/backend-lab.cjs');
const { streamAudio } = require('../tests/helpers/pcm-evidence.cjs');
const checks = [];
const guild = '923456789012345678';
const other = '923456789012345679';
let version;
let image;
(async () => {
  let failure;
  try {
    await withBackendLab(async lab => {
      const backend = lab.backends.find(n => n.kind === 'nodelink');
      version = backend.version; image = backend.image;
      const manager = new Manager({
        nodes: [backend],
        send() { throw new Error('No Discord gateway use allowed'); },
        options: { database: { type: 'memory' }, resume: false }
      });
      manager.on('nodeError', () => {});
      let node;
      try {
        const ready = event(manager, 'nodeReady', 15000);
        await manager.init('823456789012345678'); [node] = await ready;
        const health = await node.getSourceHealth();
        assert.equal(typeof health.enabled, 'boolean');
        assert.equal(typeof health.summary.total, 'number');
        checks.push('validated source-health endpoint');
        await node.rest.updatePlayer(guild, { volume: 35, paused: true });
        await node.rest.updatePlayer(other, { volume: 35, paused: true });
        const group = await node.rest.createGroup({id:'lab-radio',guildIds:[guild,other]});
        assert.deepEqual(new Set(group.guildIds),new Set([guild,other]));
        assert.ok((await node.rest.getGroups()).some(g=>g.id==='lab-radio'));
        assert.equal((await node.rest.getGroup('lab-radio')).id,'lab-radio');
        const updated = await node.rest.updateGroup('lab-radio',{volume:25,paused:true});
        assert.equal(updated.errors?.length ?? 0,0);
        assert.equal(updated.players.length,2);
        assert.ok(updated.players.every(p=>p.volume===25));
        await node.rest.deleteGroup('lab-radio');
        assert.ok(!(await node.rest.getGroups()).some(g=>g.id==='lab-radio'));
        assert.equal((await node.rest.getPlayers()).length,2);
        checks.push('group CRUD and per-member volume without voice');
        const sb = await node.rest.getSponsorBlock(guild);
        assert.equal(typeof sb.enabled,'boolean');
        const changed = await node.rest.updateSponsorBlock(guild,{enabled:false,categories:['sponsor'],actionTypes:['skip'],skipMarginMs:250});
        assert.equal(changed.enabled,false);
        await node.rest.clearSponsorBlock(guild);
        checks.push('SponsorBlock read/update/clear without external provider request');
        const ack = await node.rest.updatePlayer(guild,{crossfade:{enabled:true,duration:5000,curve:'sinusoidal',mode:'smart',minBufferMs:250,bufferMs:0}});
        assert.ok(ack);
        await node.rest.updatePlayer(guild,{crossfade:{enabled:false}});
        checks.push('crossfade PATCH accepted (not audible mixing evidence)');
        const loaded = await node.rest.loadTracks(lab.mediaUrl);
        assert.equal(loaded.loadType,'track');
        // These assertions process actual bytes streamed by a pinned NodeLink
        // server from a locally synthesized tone. No voice/gateway is involved.
        const encoded = loaded.data.encoded;
        const full = await streamAudio(node.rest, encoded);
        assert.ok(full.evidence.bytes >= 96000 && full.evidence.bytes <= 210000,
          'Expected decoded full-length 48 kHz stereo samples');
        assert.ok(full.evidence.nonZero > 4000 && full.evidence.rms > 10,
          'Actual decoded audio must contain a substantial non-silent signal');
        checks.push('real local WAV decode: streamed 48 kHz stereo PCM (not Discord voice)');

        const raw = await streamAudio(node.rest, encoded, { format: 'raw' });
        assert.match(String(raw.headers['content-type']), /audio\/l16/i);
        assert.ok(Math.abs(raw.evidence.durationMs - full.evidence.durationMs) < 120,
          'Raw and WAV requests must decode comparable track duration');
        assert.ok(raw.evidence.rms > 10,
          'Raw PCM response must contain decoded sound');
        checks.push('raw PCM stream: verified non-silent decoded samples');

        const muted = await streamAudio(node.rest, encoded, { volume: 0 });
        assert.ok(muted.evidence.bytes >= 96000, 'Muted stream must retain audio frames');
        assert.ok(muted.evidence.rms < Math.max(2, full.evidence.rms * 0.03),
          'Volume zero must actually silence the output PCM');
        checks.push('volume zero: actual PCM signal attenuation confirmed');

        const quiet = await streamAudio(node.rest, encoded, { volume: 25 });
        assert.ok(quiet.evidence.nonZero > 100, 'Quiet stream must still have signal');
        assert.ok(quiet.evidence.rms > muted.evidence.rms + 1,
          'Quarter-volume stream must be louder than muted stream');
        assert.ok(quiet.evidence.rms < full.evidence.rms * 0.8,
          'Quarter-volume stream must attenuate the actual PCM signal');
        checks.push('volume 25 versus 100: actual PCM RMS attenuation confirmed');

        // Seeking a one-second fixture leaves a very short decoder tail.
        // Use a separate three-second fixture so the seek can be checked
        // independently of EOF buffering and short-media behavior.
        const longer = await node.rest.loadTracks(lab.seekMediaUrl);
        assert.equal(longer.loadType, 'track');
        const durationMs = longer.data.info.length;
        assert.ok(durationMs > 2500 && durationMs < 3500, 'Expected three-second seek fixture');
        let resumed;
        try {
          resumed = await streamAudio(node.rest, longer.data.encoded, { position: 500 });
        } catch (error) {
          throw new Error('Three-second WAV seek at 500 ms failed: ' + 
            (error?.code || error?.name || 'unknown') + ' - ' + error.message);
        }
        const trimmedMs = durationMs - resumed.evidence.durationMs;
        assert.ok(trimmedMs > 300 && trimmedMs < 700,
          '500 ms seek must shorten decoded stream by roughly half a second; got ' +
          trimmedMs.toFixed(1) + ' ms');
        assert.ok(resumed.evidence.rms > 10 && resumed.evidence.nonZero > 1000,
          'Seeked stream must still contain valid non-silent PCM');
        checks.push('500 ms seek: verified shorter non-silent decoded three-second fixture');
        const lyrics = await node.rest.loadLyrics(loaded.data.encoded,{type:'onlyCaptions',source:'youtube',lang:'es'});
        assert.ok(lyrics && ['empty','error','lyrics'].includes(lyrics.loadType));
        checks.push('captions request with disabled providers');
      } finally {
        try {
          if(node?.connected){
            for(const id of [guild,other]) await node.rest.destroyPlayer(id).catch(()=>{});
          }
        } finally {await manager.shutdown();}
      }
    },{streaming:true,mix:true});
  } catch(error) {failure=error instanceof Error?error.message:String(error);}
  const report={scope:'modern NodeLink isolated API; no Discord audio',version,image,checks,passed:!failure,...(failure?{error:failure}:{})};
  await fs.mkdir('.runtime/extensions',{recursive:true});
  await fs.writeFile('.runtime/extensions/modern-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(!report.passed)process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
