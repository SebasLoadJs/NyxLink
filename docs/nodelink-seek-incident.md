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


## HTTP-framing differential probe

The isolated modern-NodeLink test lab additionally sends four independent,
bounded requests against the same three-second synthetic encoded track:

| Probe | Output format | JSON position | HTTP Range |
| --- | --- | ---: | --- |
| wav-position | WAV | 500 ms | none |
| raw-position | raw PCM | 500 ms | none |
| wav-range | WAV | 0 ms | bytes=96044- |
| raw-range | raw PCM | 0 ms | bytes=96000- |

All offsets use the advertised 48 kHz, 16-bit, two-channel PCM layout:
192 bytes per millisecond and 44 bytes of RIFF header. The probe records
HTTP status, Content-Length, Content-Range, transfer encoding, bytes
received, whether Node.js marked the response complete and any error code.
It does **not** store the encoded track, Authorization header, audio bytes
or local credentials. HTTP completion of a range response alone is not
proof of correct audio seek contents, which requires separately examining
decoded PCM.

Real results are included under `seekWireProbes` in the pinned NodeLink
lab report; hypotheses about transport behavior must be updated only
after observing those results.


### Initial HTTP framing result and duration hypothesis

The first differential run showed:
- WAV with JSON `position:500`: HTTP 200, chunked transfer, 44-byte
  RIFF header then abort; `complete:false`.
- Raw PCM with JSON `position:500`: `ECONNRESET` before HTTP headers.
- Both HTTP `Range` variants: HTTP 200, complete **full-track** output
  (576044 bytes WAV, 576000 bytes raw), **not** HTTP 206 and **not**
  the requested trim. No Content-Length was announced in either case.
- Thus a mismatch between advertised Content-Length and received bytes
  is **not supported by this evidence**; the server used chunked transfer.

[Inferencia] The pinned NodeLink HTTP source constructs decoded tracks
with `length:-1`. Its streaming route treats non-positive duration as
live/unknown-length and ignores HTTP ranges for that condition. A
separate test-only `seekMetadataProbe` now re-encodes the same HTTP
track with its duration measured from actual decoded PCM (3 seconds),
then tries a byte range and nonzero JSON position. This is an isolated
diagnostic **only**: forged duration metadata must not be applied to
ordinary music streams without reliable duration evidence.


### Controlled re-encoding result (known 3,000 ms)

The candidate NodeLink `dev` head is still the pinned
`97bbce1e169f18811c69836e3d0fa7f87e1d13fe`; there is no
newer `dev` revision to test from this remote at the time of the probe.

The modern test re-encoded **only the generated 3-second HTTP track**
with its known duration from decoded audio; no production track metadata
was changed. The pinned backend reported:

- Original HTTP track: `length=-1`, `isStream=false`.
- Test-only track: `length=3000`, `isStream=false`.
- `format=raw`, `Range: bytes=96000-` on known-duration track:
  request ended in `ECONNRESET` **before headers**.
- `format=wav`, `position=500` on known-duration track:
  HTTP 200 advertised `Content-Length: 480044`, wrote only
  44 RIFF/WAV header bytes, then aborted (`complete=false`).

The positive track length makes the route calculate finite output sizes,
but it **does not repair the decoder or stream completion**. For the
original unknown-length HTTP track, responses used chunked framing and
ignored HTTP Range. The statement that this defect is *solely* caused
by missing duration metadata is therefore disproven by this experiment.

**Unresolved:** inspect the server's `seekableStream` integration for
WAV and its handling of source range/seek requests. Do not automatically
re-encode ordinary user tracks with fabricated durations or retry broken
remote seeks as successful playback. The NyxLink client must continue
reporting these streams as failed.
