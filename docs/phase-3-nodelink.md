# Phase 3 — NodeLink modernization

Upstream protocol review: [NodeLink dev 97bbce1](https://github.com/PerformanC/NodeLink/tree/97bbce1e169f18811c69836e3d0fa7f87e1d13fe), 2026-11-22. Client contracts are independently implemented against public HTTP shapes; no upstream server implementation is incorporated. Existing integration image remains pinned to 804e0d6 until the newer server build passes the integration matrix.

## 3.1 Source health and lyrics options

- GET /v4/sources/health via Node.getSourceHealth() and Rest.getSourceHealth().
- Validate status, summary, optional telemetry, probe details before recording observed support.
- /v4/info sourceHealth.enabled advertises presence of the diagnostic interface; false is a valid response and must not be confused with an unavailable endpoint.
- Node.loadLyrics and Rest.loadLyrics accept either the legacy language string or { lang, source, type: 'lyrics' | 'onlyCaptions' }.
- Older servers may not support source/type filters; no claim of captions availability without a provider and real integration.
- These changes are tested against client HTTP fixtures first. New upstream image, source-health WebSocket notifications, groups, SponsorBlock, transition controls and actual audio behavior remain separate work.

## Remaining milestones

1. Source-health event lifecycle and optional source-aware selection.
2. Crossfade/fading and next-track synchronization; validate actual wire payloads.
3. Group player operations and partial-failure contracts.
4. SponsorBlock and other optional endpoints.
5. Update pinned NodeLink lab, run enabled/disabled scenarios and publish compatibility evidence.

## 3.2 Real-time source health

SourceHealthSnapshotEvent and SourceHealthChangeEvent are handled before guild/player lookup and wait for backend detection. Generation/socket guards prevent earlier connections from updating the cache. Node.sourceHealth.get(source) and .list() return detached observations with local receipt time; snapshots/changes are validated, older timestamps are ignored, and disconnect/close clears state. Typed manager events sourceHealthSnapshot and sourceHealthChange expose accepted events. This is monitoring only: no implicit source blocking, retries or routing changes. Real upstream integration and opt-in source-aware routing remain follow-up work.

## 3.3 Optional source-aware node selection

`manager.nodes.findNode({ preferSource: 'youtube', sourceHealthMaxAgeMs: 120000 })` ranks fresh healthy source telemetry above unknown, degraded and unavailable/open-circuit observations, after existing hard requirements, readiness and region preference. Missing and expired observations remain neutral; unhealthy source observations are soft preferences, not automatic provider bans. `options.search.sourceHealth: true` enables initial node preference for recognized text-search aliases; explicit nodes, URLs and custom source identifiers retain existing behavior. Platform fallback stays on the selected node. No extra network calls or timers are introduced.

## 3.4 Per-player crossfade controls

Public `setCrossfade`, `clearCrossfade`, `getCrossfade` and raw `crossfade` payload use the current upstream fields (`enabled`, `duration`, `curve`, `mode`, `minBufferMs`, `bufferMs`). Runtime validation follows documented wire bounds; no server code is copied. Control requests are serialized with playback commands; requested configuration is stored only after a non-null successful update acknowledgement. `getCrossfade` returns a detached copy of the last acknowledged request, not proof that an older server honored the options. NodeLink play/restart reapplies it; Lavalink never receives this field. Existing fading and loudness controls now commit state after acknowledgement as well. No claim of actual crossfade or AutoMix until an updated NodeLink lab validates behavior.

## 3.5 NextTrack handoff and AutoMix boundary

Accepted preloads are now tracked centrally for both typed and raw Player updates. A promoted preload is consumed immediately on its accepted TrackStart, including when the WebSocket event precedes the HTTP acknowledgment. Stop explicitly clears a pending NodeLink preload in the same update. getNextTrack returns a detached observation. Explicit setNextTrack is a manual preload API, not automatic queue ownership; queue management remains the caller's responsibility until a dedicated scheduler is implemented. Existing crossfading/gapless end events bypass queue/autoplay advancement.

Upstream review at 97bbce1: AutoMix analysis is server-side in playback/player.ts and AutoMixRegistry, triggered by next-track preparation. The public per-player PATCH contract exposes nextTrack and crossfade but no separate autoMix toggle. NyxLink therefore does not invent a setAutoMix endpoint or claim that server-side analysis was tested. Real transition audio and the queue-aware scheduling layer remain pending.

## 3.6 Optional queue preload scheduler

`player.setQueuePreload({ enabled: true, leadMs: 35000 })` opts in after `setCrossfade`. It uses normal queue mutations and position events, no additional timer. Requests coalesce and are serialized; the current playback ticket, connection and queue-head identity are rechecked after resolving a track. A reserved track stays in the queue until an accepted preloaded start, at which point exactly one matching queue object is removed and the old current track enters history. Existing manual preloads take precedence. Stream/unknown-length playback, loop modes, paused preparation and incompatible backends are excluded; an automatic reservation is cleared on ordinary play/restart and stop. A failed request is rate-limited for ten seconds. Queue edits are reconciled asynchronously: a server may already have begun the former reservation before cancellation arrives; the client records accepted handoffs rather than claiming atomic remote queue control. Options are runtime-only. Test actual audio and reconnection transitions in the newer integration lab.

## 3.7 Player groups and SponsorBlock

The NodeLink-specific route catalog now includes group list/get/create/update/delete and SponsorBlock get/update/segment override/clear. Group updates expose per-guild successes and errors (even with HTTP 200); membership and response identities are checked. IDs are limited to safe ASCII path segments for client-created groups. Group APIs are low-level remote orchestration: they may create remote players, do not own local queues or synchronize local player intents, and cannot guarantee synchronized audio. Applications coordinating local Player instances need a separate orchestration policy. SponsorBlock controls return validated settings and segments; they do not assume a server plugin is enabled. Existing missing-resource versus missing-endpoint policy is preserved. Live upstream verification remains pending.

## 3.8 Modern server lab (candidate)

The previous digest remains the baseline. A second CI job uses the immutable NodeLink image for revision 97bbce1e169f18811c69836e3d0fa7f87e1d13fe, digest sha256:922acc221c5f3239a795ba616e925c01b86f9f41a3ac3bc5c1b2b91859fcc64e, verified from upstream [Docker Image CI](https://github.com/PerformanC/NodeLink/actions/runs/44984274202). The lab checks the container revision label. The modern profile runs the common protocol suite and dedicated health, groups, SponsorBlock and crossfade control tests on empty players. It does not send Discord gateway credentials or test audible transitions. This entry describes the intended tests, not successful results; CI evidence is required before promoting the candidate.

### 3.8.1 Modern protocol CI finding

In the first modern-image run, all dedicated NodeLink extension checks passed, but one common-protocol integration assertion failed: a rolled-over empty player retains its timescale filter in pinned NodeLink 97bbce1, while pinned 804e0d6 returned an empty filter object. The client sent the same filter payload in both cases; the changed outcome belongs to the server. The test suite now explicitly asserts the distinct remote behavior for each immutable profile. This is not an audible filter test: no Discord voice was used. Full modern-profile CI must pass before the modern matrix is accepted. [First diagnostic run](https://github.com/SebasLoadJs/NyxLink/actions/runs/44997271539).

### 3.8.2 Empty-player filter responses are not deterministic

Two consecutive runs on the *same immutable modern NodeLink revision* reported distinct empty-player filter responses: an applied-looking timescale object in [44997271539](https://github.com/SebasLoadJs/NyxLink/actions/runs/44997271539), then an empty filter map in [45038480695](https://github.com/SebasLoadJs/NyxLink/actions/runs/45038480695). The test now accepts precisely those two documented representations, checks every field when the filter is present, verifies the actual outbound request and local stored filter, and records the observed remote form in the integration evidence. No claim of filter audio effects is made. Further investigation requires track-active backend tests. The modern suite remains a candidate until CI passes.

### 3.8.3 Confirmed wire-envelope distinction

Upstream NodeLink 97bbce1 `Player.toJSON()` exports its `FiltersState` object at `player.filters`, while the effective entries are nested under `player.filters.filters`. Lavalink v4 uses a flat map. Previous failing modern assertions tried to read `remote.filters.timescale` instead of `remote.filters.filters.timescale`. The integration suite now validates both correctly, with an explicit fallback to the empty-state response observed in the older NodeLink image. Filter audio still requires live voice validation. [Relevant server implementation](https://github.com/PerformanC/NodeLink/blob/97bbce1e169f18811c69836e3d0fa7f87e1d13fe/src/playback/player.ts).

## 3.9 Verified modern NodeLink protocol milestone (2026-11-22)

At NyxLink [b9c451e](https://github.com/SebasLoadJs/NyxLink/commit/b9c451eedc1da1c07dd230a73840ddfe3e2fc951), the pinned modern server revision 97bbce1 was accepted for **REST / WebSocket contract integration without Discord voice**. Evidence: [modern and baseline protocol integration](https://github.com/SebasLoadJs/NyxLink/actions/runs/45038936275) (both jobs successful), [Node.js 22/24 strict validation with 587 passing tests](https://github.com/SebasLoadJs/NyxLink/actions/runs/45038936280), [CodeQL](https://github.com/SebasLoadJs/NyxLink/actions/runs/45038936273), and [isolated endurance](https://github.com/SebasLoadJs/NyxLink/actions/runs/45038936360) all passed.

Verified modern endpoint scenarios: Source Health JSON contract, session groups list/create/update/delete and member-volume control, SponsorBlock state/update/clear, per-player Crossfade configuration PATCH acknowledgments, and Lyrics/Caption request option handling against disabled providers. Common protocol scenarios include both directions of empty-player migration and rollback, owned session recovery, authentication, track resolution, REST state and feature gating. Empty-player filter responses are checked according to NodeLink's nested FiltersState; they do not prove active-stream filter processing.

**Still not verified:** Discord gateway voice packets/audio, actual audible Crossfade/AutoMix transitions, SponsorBlock skipping during real playback, populated lyrics from live providers, plugin/source coverage, multi-hour production-quality soak and timing/synchronization of concurrent grouped audio. These are separate acceptance gates; do not label the entire Phase 3 or NyxLink 1.0 production-ready based on the HTTP laboratory alone.

## 3.10 In-flight queue reconciliation

Changes to queue order, removal or preload options while an HTTP PATCH is pending now set a coalesced reconciliation flag. When the current queued task completes it schedules one subsequent serialized pass without relying on another position update. Turning Crossfade off also requests a pass, cancelling only automatically reserved next tracks while leaving queued tracks untouched. This addresses a client race at the REST/event boundary; real audible transition verification is still required.

## 3.11 Opt-in voice acceptance harness

Added `scripts/test-live-voice.cjs` and [operator checklist](live-voice-verification.md) to exercise real Discord gateway + NodeLink audio only with explicit local credentials and the `--armed` flag. The harness records ordered TrackStart and TrackEnd events and protects token secrecy, but cannot itself claim audible Crossfade. It is not run in CI because the project has no authorized test bot or voice-server credentials connected. The script's defensive configuration and no-network default are regression-tested; actual Discord playback remains pending manual execution and listener verification.


## 3.12 Real NodeLink PCM stream acceptance

The modern NodeLink revision at `97bbce1` defines `POST /v4/loadstream`
with output format `raw` (48 kHz stereo signed 16-bit PCM) or `wav`
(RIFF/WAVE wrapping that PCM). NyxLink previously exposed `pcm`, which
NodeLink does not accept on the wire. The client now sends the canonical
`raw` value when callers use the legacy `format: "pcm"` alias; explicit
`"raw"` and `"wav"` are also accepted. Invalid volume, position,
filters and format values fail before any network request.

The modern CI lab requests its locally synthesized one-second 440 Hz WAV
through the *real pinned NodeLink streaming and decoding endpoint*.
It reads at most 1 MiB with a 30-second abort, checks PCM RIFF headers
(48 kHz, stereo, 16-bit) and requires more than 4,000 nonzero samples.
No third-party music, Spotify, YouTube, Discord token or Discord voice
is used. A successful result demonstrates real source decoding and
binary streaming, **not** a Discord UDP/Opus audio session, audible
crossfade, AutoMix, sample-accurate gapless playback or failover.
The test is a CI release gate, so its status must be verified per run.


## 3.13 Real PCM volume and seek acceptance

The modern NodeLink container lab decodes a locally generated one-second,
440 Hz WAV using four client requests: full WAV (100% volume), raw PCM,
muted WAV (0%) and quarter-volume WAV (25%). A separate three-second
440 Hz WAV tests position 500 milliseconds without hitting the short
fixture's end-of-file decoder boundary. Every request uses the actual
container's HTTP decoder. The first 500 ms seek attempt against the
one-second fixture failed with `aborted`; that behavior is not recorded
as successful seek support.
A bounded reader limits each response to 1 MiB and cancels stalled requests
after 30 seconds. The test checks real 48 kHz stereo S16LE samples, verifies
the silent and quiet output using RMS amplitude, and verifies that seeking
removes approximately half a second of audio while preserving nonzero samples.

The initial seek test (one-second WAV) failed, returning `aborted`.
A second run using a three-second WAV revealed untrustworthy duration
metadata; the third run measured the duration directly from decoded PCM but
still failed with `ECONNRESET: aborted` on `position: 500`. These results
prove an unresolved real-server compatibility issue, **not** a successful
seek. They do not, by themselves, establish whether the defect belongs
to NodeLink's seekable HTTP source, stream finalization, or the client
transport. The pinned modern CI job records `seekEvidence` as
`verified` or `failed` separately from the mandatory, independently
passing WAV/raw/volume checks. Set `NYXLINK_REQUIRE_SEEK=1` to turn
a failed seek probe into a required CI failure when diagnosing it.

All acceptance claims depend on the relevant **successful
modern-nodelink CI job**. PCM volume processing alone does not prove
position decoding, Opus encoding, UDP/Discord voice transport,
sample-accurate two-track crossfade, AutoMix or survival of real voice
disconnections. Those remain separate acceptance gates.


## 3.14 NodeLink original media passthrough and format discovery (upstream 2026-11-22)

NodeLink `dev` commit
[`a283f2f4`](https://github.com/PerformanC/NodeLink/commit/a283f2f4e2f16e856a0da315a946fad2bfb9989d)
introduced two new `POST /v4/loadstream` representations:

- `format:'formats'`: a **JSON** metadata catalogue listing source, protocol,
  MIME type, optional itag and available formats. NyxLink exposes this as
  `node.getStreamFormats(track)` and `node.rest.getStreamFormats(encodedTrack)`,
  with nested response validation and bounded HTTP timeout. The JSON catalogue
  is not a readable audio stream.
- `format:'passthrough'` (including wire aliases `'original'`/`'source'`):
  source-container bytes **without PCM decoding or filters**. NyxLink exposes
  `node.loadSourceStream(track, { itag, range })` and supports the same mode
  in `node.rest.loadStream`. The response includes HTTP `statusCode` so a
  caller can distinguish a confirmed `206` partial response from a `200`
  origin that ignored `Range`. The source format must be inspected from the
  returned HTTP headers, **not assumed to be PCM/WAV**.

Example:

```ts
const formats = await node.getStreamFormats(track);
const { stream, headers, statusCode } = await node.loadSourceStream(track, {
  range: 'bytes=0-65535',
});
if (statusCode !== 206) throw new Error('Source ignored the requested byte range');
// stream contains source-container data, not decoded S16LE samples.
```

Single HTTP byte ranges are strictly validated; newline injection, multipart
ranges, invalid itag values, and use of `pcm-trim` with compressed passthrough
are rejected before network I/O. The legacy PCM/WAV API is unchanged.

**Compatibility gate:** the NyxLink isolated modern NodeLink image is
currently pinned to older commit `97bbce1`, which predates these extensions.
A green pinned-container CI run validates the existing PCM protocol; the new
formats/passthrough client behavior is separately verified by local HTTP
protocol fixtures. Do **not** claim new NodeLink binary features were
integration-tested against the latest upstream build until a newer immutable
container revision is published, pinned, and exercised.


## 3.15 Streaming wire-format integrity

The NodeLink HTTP streaming client now checks its expected **representation**
before returning a supposedly successful `loadStream` readable. A successful
`200` or `206` status is **not** enough to establish that the response is audio.

- `format:'raw'` and legacy `'pcm'` require the documented
  `audio/l16;rate=48000;channels=2` media type (the media type is
  case-insensitive).
- `format:'wav'` requires an audio WAV media type, rather than mistaking
  raw PCM or JSON for a playable RIFF stream.
- `format:'passthrough'` requires NodeLink's
  `X-NodeLink-Passthrough: true` marker. The content is still a source
  container, **never** assumed PCM. A server predating this feature, or
  one ignoring the requested format, is rejected rather than returning
  misidentified audio.
- `text/*`, `application/json`, and `*+json`/`*+xml` responses are rejected
  even if a reverse proxy incorrectly responds HTTP `200`.
- The incoming HTTP response is destroyed promptly on a contract error.
  The `loadstream` capability is not marked available for such failures.
  Existing network/abort failures and the bounded `pcm-trim` fallback
  retain their error semantics.

These checks do **not** inspect raw audio samples or guarantee that a
stream completes; malformed audio bytes or midstream disconnection must
still be handled by the downstream reader. The preexisting pinned
NodeLink container suite continues checking real PCM audio and signal
levels, while isolated protocol fixtures test wrong media types and
legacy passthrough behavior.


## YouTube LiveChat — optional NodeLink connection lifecycle

`node.createYouTubeLiveChat(identifier, options)` creates a NodeLink-only chat
client. This is an optional WebSocket stream; it is not a Discord voice receiver
and is not part of the mandatory audio playback path.

```ts
const chat = node.createYouTubeLiveChat('authorized-live-video-id', {
  autoReconnect: true,
  reconnectDelay: 5000,
  maxReconnectAttempts: 5,
});
chat.on('message', message => console.log(message.content));
chat.on('error', error => console.error(error.message));
chat.connect();
// Later, when no longer needed:
chat.close();
```

Reconnect policy is bounded (delay 0..300000 ms, attempts 0..20). A manual
`close()` cancels pending reconnect timers and suppresses automatic reconnection.
Duplicate `connect()` calls do not create parallel sockets, while callbacks
belonging to old sockets cannot deliver messages or schedule additional attempts.
Opening a new healthy socket resets the reconnect budget. Invalid JSON errors
do not quote untrusted message content.

**Evidence:** `tests/youtube-livechat-lifecycle.test.cjs` checks stale-event
fencing, manual close during retry, retry exhaustion, option validation and
diagnostic sanitization using a fake local transport.

**Still unverified:** source permissions, live NodeLink YouTube chat availability,
provider rate limits, network authentication under a real deployment, and
consent or moderation requirements for storing messages. Do not call this
feature production-verified until those conditions are tested.
