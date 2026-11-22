const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { Manager } = require('../dist');
const { event } = require('../tests/helpers/v4-server.cjs');
const { withBackendLab } = require('../tests/helpers/backend-lab.cjs');
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
        // Unlike an accepted PATCH, the loadstream endpoint returns actual
        // decoded PCM. This is a real source/decoder test without Discord voice.
        const controller = new AbortController();
        const streamTimeout = setTimeout(() => controller.abort(), 30000);
        streamTimeout.unref?.();
        let audio;
        try {
          const wav = await node.rest.loadStream({
            encodedTrack: loaded.data.encoded, format: 'wav', volume: 100, position: 0
          }, { signal: controller.signal, timeoutMs: 30000 });
          const chunks = [];
          let size = 0;
          try {
            for await (const chunk of wav.stream) {
              size += chunk.length;
              if (size > 1024 * 1024) throw new Error('Decoded WAV exceeded the local fixture budget');
              chunks.push(chunk);
            }
          } finally {
            wav.stream.destroy?.();
          }
          audio = Buffer.concat(chunks);
          assert.ok(audio.length >= 48044 && audio.length <= 1024 * 1024, 'Expected decoded WAV audio');
          assert.equal(audio.toString('ascii',0,4),'RIFF');
          assert.equal(audio.toString('ascii',8,12),'WAVE');
          assert.equal(audio.toString('ascii',12,16),'fmt ');
          assert.equal(audio.readUInt16LE(20),1,'16-bit linear PCM format');
          assert.equal(audio.readUInt16LE(22),2,'Stereo output');
          assert.equal(audio.readUInt32LE(24),48000,'48 kHz output');
          assert.equal(audio.readUInt16LE(34),16,'16-bit output');
          assert.equal(audio.toString('ascii',36,40),'data');
          // Prove this is decoded sound, not a silent, empty or metadata-only stream.
          let nonZero = 0;
          for (let i=44; i + 1 < audio.length; i+=2) if (audio.readInt16LE(i)!==0) nonZero++;
          assert.ok(nonZero > 4000, 'Decoded PCM must contain non-silent audio samples');
          checks.push('real local WAV decode: streamed 48 kHz stereo PCM (not Discord voice)');
        } finally {
          clearTimeout(streamTimeout);
        }
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
