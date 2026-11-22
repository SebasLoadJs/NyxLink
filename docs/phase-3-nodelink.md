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
