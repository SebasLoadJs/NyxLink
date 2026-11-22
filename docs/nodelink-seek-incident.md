# Open compatibility defect: NodeLink WAV HTTP seeking aborts

**Status:** unresolved, reproducible against an immutable NodeLink modern image.  
**First observed:** 2026-11-22  
**Related PR:** [#26](https://github.com/SebasLoadJs/NyxLink/pull/26)

## Environment

- Server: NodeLink `3.10.0-dev.2026-11-15.8`
- Source commit: `97bbce1e169f18811c69836e3d0fa7f87e1d13fe`
- Docker image: `ghcr.io/performanc/nodelink@sha256:922acc221c5f3239a795ba616e925c01b86f9f41a3ac3bc5c1b2b91859fcc64e`
- Input: generated 440 Hz mono S16LE 48 kHz RIFF/WAV served by the local HTTP fixture over loopback, with HTTP Range supported
- Audio output: NodeLink `POST /v4/loadstream`, requested as 48 kHz stereo PCM in WAV
- Discord bot, voice or gateway: **not involved**

## Reproduction

1. Run the isolated NodeLink lab with `NYXLINK_CONTAINER_ENGINE=docker` and `NYXLINK_NODELINK_PROFILE=modern`.
2. Load `http://127.0.0.1:<fixture-port>/seek-tone.wav` (3-second fixture) using `GET /v4/loadtracks`.
3. Call `node.rest.loadStream({ encodedTrack, format:'wav', volume:100, position:0 })`. It returns decoded audio.
4. Call `node.rest.loadStream({ encodedTrack, format:'wav', volume:100, position:500 })` and drain the returned stream.
5. The seeked stream fails with `ECONNRESET: aborted`. The earlier one-second fixture also failed with `aborted`.

Evidence:
- [1-second fixture CI failure](https://github.com/SebasLoadJs/NyxLink/actions/runs/45054168769)
- [3-second fixture CI failure](https://github.com/SebasLoadJs/NyxLink/actions/runs/45054676413/job/137307154021)

The decoded track's advertised duration was also insufficiently reliable for the first 3-second test assertion. That assertion was replaced with a real PCM length measurement; the subsequent position-500 stream still aborted.

## Proven separately

- WAV format returns actual 48 kHz stereo S16LE audio with nonzero samples.
- Raw PCM format returns actual nonzero samples.
- Volume 0 suppresses the PCM signal.
- Volume 25 attenuates RMS amplitude relative to volume 100.

Those passing observations do **not** certify seek, source-independent playback, Crossfade, AutoMix, Opus/Discord UDP or gap-free node failover.

## Investigation needed

[Inferencia] HTTP range seeking, decoder EOF/length finalization, or a mismatch between the announced HTTP Content-Length and actual PCM bytes might trigger the abort. The responsible implementation layer is **not proven**. Inspect the server pipeline and HTTP connection framing; reproduce with raw PCM and other source formats before attributing this to NodeLink or NyxLink.

The normal modern backend acceptance job records `seekEvidence.status: 'failed'` as a diagnostic instead of falsely listing seek as a passing feature. To make seeking a required gate for a targeted investigation, set `NYXLINK_REQUIRE_SEEK=1`. Do not treat a green baseline job as a successful seek test.

*GitHub Issues are disabled in SebasLoadJs/NyxLink (the API returned HTTP 410), so this repository document is the persistent tracker.*
