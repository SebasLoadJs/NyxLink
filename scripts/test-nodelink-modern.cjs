const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { Manager } = require('../dist');
const { event } = require('../tests/helpers/v4-server.cjs');
const { withBackendLab } = require('../tests/helpers/backend-lab.cjs');
const { streamAudio } = require('../tests/helpers/pcm-evidence.cjs');
const { probeLoadStream } = require('../tests/helpers/stream-seek-probe.cjs');
const checks = [];
const guild = '923456789012345678';
const other = '923456789012345679';
let version;
let image;
let seekEvidence = { status: 'not-run' };
let seekWireProbes = [];
let seekMetadataProbe = { status: 'not-run' };
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

        // The pinned NodeLink build has repeatedly reset HTTP streams when
        // seeking into generated WAVs (both 1 s and 3 s fixtures). Keep an
        // explicit, independently inspectable probe; do not advertise seek as
        // verified, and do not hide regression in the supported PCM checks.
        let longerEncoded;
        let longerTrackInfo;
        let longerDurationMs;
        try {
          const longer = await node.rest.loadTracks(lab.seekMediaUrl);
          longerEncoded = longer?.data?.encoded;
          longerTrackInfo = longer?.data?.info;
          assert.equal(longer.loadType, 'track');
          const longerFull = await streamAudio(node.rest, longer.data.encoded);
          const durationMs = longerFull.evidence.durationMs;
          longerDurationMs = durationMs;
          assert.ok(durationMs > 2500 && durationMs < 3500,
            'Expected three-second decoded seek fixture, got ' + durationMs.toFixed(1) + ' ms');
          const resumed = await streamAudio(node.rest, longer.data.encoded, { position: 500 });
          const trimmedMs = durationMs - resumed.evidence.durationMs;
          assert.ok(trimmedMs > 300 && trimmedMs < 700,
            '500 ms seek must trim about half a second of PCM; got ' + trimmedMs.toFixed(1) + ' ms');
          assert.ok(resumed.evidence.rms > 10 && resumed.evidence.nonZero > 1000,
            'Seeked stream must contain non-silent PCM');
          seekEvidence = { status: 'verified', requestedPositionMs: 500, observedTrimMs: trimmedMs };
          checks.push('500 ms seek: verified shorter non-silent decoded three-second fixture');
        } catch (error) {
          seekEvidence = {
            status: 'failed',
            requestedPositionMs: 500,
            code: typeof error?.code === 'string' ? error.code : 'unknown',
            message: String(error?.message ?? error).slice(0, 240),
          };
          console.warn('NodeLink seek probe not verified:', JSON.stringify(seekEvidence));
          if (process.env.NYXLINK_REQUIRE_SEEK === '1') throw new Error('Strict seek verification failed');
        }

        // Probe the same media through four independent wire combinations.
        // These measurements are *diagnostic*: a completed response alone
        // cannot prove that the decoded audio starts at the right position.
        if (typeof longerEncoded === 'string') {
          const variants = [
            { name: 'wav-position', format: 'wav', position: 500 },
            { name: 'raw-position', format: 'raw', position: 500 },
            { name: 'wav-range', format: 'wav', position: 0, range: 'bytes=96044-' },
            { name: 'raw-range', format: 'raw', position: 0, range: 'bytes=96000-' },
          ];
          for (const variant of variants) {
            seekWireProbes.push(await probeLoadStream(backend, node.sessionId, longerEncoded, variant));
          }
          console.log('NodeLink seek wire diagnostics:', JSON.stringify(seekWireProbes));

          // The built-in HTTP source advertises length=-1 even for a finite
          // WAV. Probe a *test-only* re-encoded track with the observed full
          // PCM duration to distinguish unknown-length handling from actual
          // decoder seeking failures. Do not change public track metadata.
          if (Number.isFinite(longerDurationMs) && longerDurationMs > 2500 &&
              longerTrackInfo && typeof longerTrackInfo === 'object') {
            try {
              const encodedKnown = await node.rest.encodeTracksRemote([{
                encoded: longerEncoded,
                info: {
                  ...longerTrackInfo,
                  length: Math.round(longerDurationMs),
                  isStream: false,
                  isSeekable: true,
                  position: 0,
                  details: [],
                },
              }]);
              assert.ok(Array.isArray(encodedKnown) && typeof encodedKnown[0] === 'string');
              const knownRange = await probeLoadStream(backend, node.sessionId, encodedKnown[0],
                { name:'raw-range-known-duration', format:'raw', position:0, range:'bytes=96000-' });
              const knownPosition = await probeLoadStream(backend, node.sessionId, encodedKnown[0],
                { name:'wav-position-known-duration', format:'wav', position:500 });
              seekMetadataProbe = {
                status: 'observed',
                advertisedOriginalDurationMs: longerTrackInfo.length,
                originalIsStream: longerTrackInfo.isStream,
                assertedDurationMs: Math.round(longerDurationMs),
                knownRange, knownPosition,
              };
              console.log('NodeLink known-duration seek diagnostics:', JSON.stringify(seekMetadataProbe));
            } catch (error) {
              seekMetadataProbe = {
                status:'failed',
                code: typeof error?.code === 'string' ? error.code : 'unknown',
                message: String(error?.message ?? error).slice(0,240),
                advertisedOriginalDurationMs: longerTrackInfo.length,
              };
              console.warn('NodeLink known-duration probe unavailable:', JSON.stringify(seekMetadataProbe));
            }
          }

        }
        // Real workaround acceptance: NodeLink's native seek for this HTTP
        // WAV is still broken. The explicit client seek decodes from zero,
        // drops 500 ms of raw PCM and returns only the real audio tail.
        assert.equal(typeof longerEncoded, 'string', 'Seek fixture must resolve');
        const baselinePcm = await streamAudio(node.rest, longerEncoded, { format:'raw', position:0 });
        const trimmedPcm = await streamAudio(node.rest, longerEncoded,
          { format:'raw', position:500 }, { seekMode:'pcm-trim' });
        const removed = baselinePcm.evidence.bytes - trimmedPcm.evidence.bytes;
        assert.equal(removed, 500 * 192, 'Client seek must remove exactly 500 ms of PCM');
        assert.ok(trimmedPcm.evidence.rms > 10 && trimmedPcm.evidence.nonZero > 1000,
          'Client-seek tail must contain actual non-silent audio');
        const expected = baselinePcm.data.subarray(removed);
        assert.equal(trimmedPcm.data.length, expected.length, 'Client seek must preserve the remaining decoded frames');
        // Do not conflate backend seekEvidence (still failed) with client mode.
        checks.push('explicit client PCM seek: 500 ms removed, non-silent tail, backend native seek still unresolved');
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
  const report={scope:'modern NodeLink isolated API; no Discord audio',version,image,checks,seekEvidence,seekWireProbes,seekMetadataProbe,passed:!failure,...(failure?{error:failure}:{})};
  await fs.mkdir('.runtime/extensions',{recursive:true});
  await fs.writeFile('.runtime/extensions/modern-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(!report.passed)process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
