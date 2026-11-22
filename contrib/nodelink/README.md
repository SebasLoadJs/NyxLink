# NodeLink HTTP WAV seek — upstream contribution candidate

**Status:** candidate patch under isolated CI validation. **Not yet submitted
or merged upstream.** This is an experiment against the exact NodeLink revision
`a283f2f4e2f16e856a0da315a946fad2bfb9989d`, which introduced the
independent source-passthrough and formats API.

## Reported bug

NodeLink `POST /v4/loadstream` succeeds for WAV served by the HTTP source at
`position:0` but aborts when requesting `position:500`:
- Unknown-length HTTP track: only a 44-byte WAV header arrives, then connection
  aborts (`ECONNRESET` / `response.complete:false`).
- Known-duration 3000ms track: HTTP advertises 480044 bytes, outputs 44 bytes
  and aborts.
- A naive byte Range is not an equivalent fix; unknown-duration tracks ignore
  decoded-PCM Range and return the full track.

Original evidence:
- [Seek incident](../../docs/nodelink-seek-incident.md)
- [First real NodeLink failure](https://github.com/SebasLoadJs/NyxLink/actions/runs/45054168769)
- [Known-duration failure](https://github.com/SebasLoadJs/NyxLink/actions/runs/45054676413)

## Root cause

[Inferencia] `@ecliptia/seekable-stream`'s generic non-WebM byte-seek
heuristic estimates a byte position from media duration and Content-Length.
That offset is **inside** a WAV source and omits its RIFF header. The
downstream decoder cannot safely treat that fragment as an independent WAV
file. The server was observed dropping the response after its output WAV
header. Pinning length to 3000 ms alone did **not** resolve this behavior.

## Candidate fix

[`http-wav-seek.patch`](http-wav-seek.patch) only changes
`src/api/loadStream.ts`:
1. Detect the built-in HTTP source when its URL/hint unambiguously describes
   a `.wav` or `.wave` container.
2. For nonzero seek positions, ask the existing decoder to begin at **zero**,
   retaining the source container header.
3. Discard `192 × positionMs` bytes from decoded 48-kHz stereo S16LE PCM via
   an asynchronous, bounded-memory, backpressure-compatible iterator.
4. Let the pre-existing WAV/raw output, Content-Length and Range handling
   operate on the correct remaining decoded samples.

This fallback is deliberately not enabled for MP3, MP4, WebM, source-managed
audio, local files, HTTP sources without known WAV identity, or passthrough.
It is **not** a codec-independent or efficient long-distance source seek:
source and decoder work still scale with the skipped audio duration.
The maintainers may prefer a format-aware RIFF seek in
`@ecliptia/seekable-stream` after reviewing this reproducible fallback.

## Reproduce and verify

The NyxLink PR installs a *separate* GitHub Actions job that:
- checks out the exact public NodeLink source revision;
- uses `git apply --check` and `git apply` on the patch;
- runs NodeLink's real Dockerfile TypeScript build in a disposable local image
  labeled with the source revision;
- generates a three-second local WAV with a 440→880 Hz transition at 500ms;
- verifies that a 500ms seek actually removes 96,000 bytes of decoded PCM,
  produces non-silent 880Hz audio (rather than the 440Hz intro), and returns
  the expected WAV body;
- re-encodes the same test source with known duration, checks an exact
  480044-byte WAV body and completed HTTP response; and
- checks a `206` raw-PCM Range with 480000-byte payload and correct
  `Content-Range`.

No Discord tokens, music providers, private source audio or external URLs are
used by the acceptance test. A passing result does **not** certify production
Discord voice, filters with time stretching, HLS/MP4 seek, or long-range seek
performance.

Run local validation with GitHub Actions workflow
`.github/workflows/nodelink-seek-contribution.yml`. If the job passes, fork
[PerformanC/NodeLink](https://github.com/PerformanC/NodeLink), apply the
patch on a branch off the exact base SHA, and open a narrow upstream PR with
the test evidence. Do not push directly to the upstream `dev` branch.

> Contribution status is tracked here because the user's GitHub app cannot
> create a NodeLink fork with its currently available actions. Do not claim
> an upstream PR was submitted unless GitHub confirms the PR URL.
