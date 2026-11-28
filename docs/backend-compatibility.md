# Backend compatibility matrix — verified baseline

## Latest verified development checkpoint — 2026-11-28

At `c4f803aec16b376995fb69c7c3a23ac91bef5538`, all seven triggered workflows passed: [validation](https://github.com/SebasLoadJs/NyxLink/actions/runs/46109410852), [protocol integration](https://github.com/SebasLoadJs/NyxLink/actions/runs/46109410033), [Redis](https://github.com/SebasLoadJs/NyxLink/actions/runs/46109410096), [CodeQL](https://github.com/SebasLoadJs/NyxLink/actions/runs/46109410098), [local endurance](https://github.com/SebasLoadJs/NyxLink/actions/runs/46109410039), [extended endurance](https://github.com/SebasLoadJs/NyxLink/actions/runs/46109410053), and [all six refreshed proposal heads](https://github.com/SebasLoadJs/NyxLink/actions/runs/46109410124). The expanded matrix was not triggered on this revision; ten of eleven catalog entries have earlier protocol acceptance and XM remains [incompatible](xm-native-compatibility.md). No live voice or 24–72 hour soak is certified.

## Historical checkpoint — 2026-11-24

At NyxLink `770053d892939650cd0e44f5603ed8af49727409`, [validation](https://github.com/SebasLoadJs/NyxLink/actions/runs/45318101584), [baseline/modern protocols and plugins](https://github.com/SebasLoadJs/NyxLink/actions/runs/45318101522), [Redis](https://github.com/SebasLoadJs/NyxLink/actions/runs/45318101657) and [600-second endurance](https://github.com/SebasLoadJs/NyxLink/actions/runs/45318101691) passed. The image and plugin pins remain those in `tests/integration/backend-servers.json`. This supersedes the transient download failure recorded in the historical resume checkpoint below. New commits require their own checks in [dev CI](https://github.com/SebasLoadJs/NyxLink/actions?query=branch%3Adev).

| Fixed profile | Scope accepted by automated checks | Scope still pending |
| --- | --- | --- |
| Lavalink 4.2.2 | v4 REST/WS/authentication/session recovery/empty-player migration | Audible commands, track-active filters, voice recovery and production sources |
| NodeLink baseline 804e0d6 | Common v4 protocol plus enabled/disabled extension route scenarios | Live voice, populated providers and active mixer audio |
| NodeLink modern 97bbce1 | Common protocol, Source Health, groups CRUD, SponsorBlock, crossfade control, lyrics/captions request contracts and direct PCM | Actual synchronization, crossfade/AutoMix, audible skipping, populated providers |
| LavaLyrics 1.1.0 / SponsorBlock 3.0.1 | Pinned plugin detection and enabled/disabled HTTP/WS contracts | Provider permissions/content/rate limits and actual audio effects |

NodeLink seek patch acceptance is tracked separately; it does not certify unpatched images. [Operator acceptance](pending-real-world-acceptance.md) remains pending. The sections below retain historical observations rather than claiming all versions behave identically.

## Development contracts (not release certification)

The development branch additionally exposes LavaSearch discovery, NodeLink search modifiers, Holo metadata, LavaSrc metadata, LavaDSPX effects, opt-in multi-provider recommendations, native audio preference projection and optional mixer reconstruction. These additions require validation against the exact release candidate. Installed plugin metadata is not proof of optional REST endpoint availability. See [Lavalink](lavalink.md), [NodeLink](nodelink.md), [Mixer](mixer.md), and [node selection](node-selection.md).

### SponsorBlock and chapter events

Both backends expose a common `sponsorBlockEvent` observation while retaining their native wire events on `nodeRaw`. NodeLink uses `SponsorBlockSegmentsLoadedEvent` and `SponsorBlockSegmentSkippedEvent`; the Lavalink plugin uses `SegmentsLoaded`, `SegmentSkipped`, `ChaptersLoaded` and `ChapterStarted`. The typed observation records its backend and normalizes millisecond timestamps. It is not proof of the currently playing track identity: some upstream messages include only the guild ID.

```ts
manager.on('sponsorBlockEvent', (player, event) => {
    if (event.kind === 'segmentSkipped') {
        console.log(event.backend, event.segment.start, event.segment.end);
    }
});
```

See [NodeLink gateway constants](https://github.com/PerformanC/NodeLink/blob/97bbce1e169f18811c69836e3d0fa7f87e1d13fe/src/constants.ts) and [Lavalink SponsorBlock plugin](https://github.com/topi314/SponsorBlock-Plugin).

## Maintenance policy

NyxLink is a client for external audio nodes, not an audio server or a Discord voice engine. Review upstream API changes against pinned revisions, keep compatible API changes additive, retain security/runtime fixes and require protocol, packaging and audio acceptance for releases. Do not infer support for future plugins or claim playback solely from metadata or successful REST requests.

## Earlier baseline

Evidence: commit [4c0f60e](https://github.com/SebasLoadJs/NyxLink/commit/4c0f60eb467cc2fb451b7eb27746280ee44f9db6), [554 unit/contract tests](https://github.com/SebasLoadJs/NyxLink/actions/runs/44990871520), [26 integration tests and extension scenarios](https://github.com/SebasLoadJs/NyxLink/actions/runs/44990871485), [endurance](https://github.com/SebasLoadJs/NyxLink/actions/runs/44990871556). This records the tested baseline, not the result of subsequent unverified changes.

| Contract | Lavalink 4.2.2 | NodeLink 3.10.0-dev.2026-10-20.1 |
| --- | --- | --- |
| v4 detection, info, sources, stats | Passed | Passed |
| Load/decode generated HTTP audio | Passed | Passed |
| Authentication rejection | Passed | Passed |
| Empty player create/update/delete | Passed | Passed |
| Session reconnect and resume | Passed | Passed |
| Stored empty player reconstruction | Passed | Passed |
| Circuit recovery using stats | Passed | Passed |
| Destination track resolution | Passed (from NodeLink) | Passed (from Lavalink) |
| Empty player transfer/rollback | Passed (from NodeLink) | Passed (from Lavalink) |
| NodeLink extension route policy | Explicit rejection | Tested |
| Stream URL and decoded WAV without Discord | Not applicable to this route | Passed in enabled configuration |
| Disabled stream/mix capability degradation | Not applicable | Passed |
| Mix list and missing active player/layer errors | Not applicable | Passed |
| Lyrics/chapter empty responses | Dedicated plugins not tested | Passed without enabled lyrics providers |
| Audible Discord playback / live crossfade | Not tested | Not tested |
| Production plugin/provider coverage | Not tested | Not tested |

Both server images are digest-pinned in tests/integration/backend-servers.json. The NodeLink image is pinned to commit 804e0d6d0f1af30384e0a2d12ddbc8d79e85cf35. Do not treat this matrix as certification for newer builds or untested plugins. Phase 3 will explicitly review NodeLink protocol changes; phase 4 will test Lavalink plugin integrations separately.

## Modern NodeLink candidate (initial CI observation)

Pinned NodeLink 97bbce1, image digest sha256:922acc221c5f3239a795ba616e925c01b86f9f41a3ac3bc5c1b2b91859fcc64e, was used in the modern integration run [44997271539](https://github.com/SebasLoadJs/NyxLink/actions/runs/44997271539). Dedicated source-health, group CRUD, SponsorBlock, crossfade control acknowledgment and captions-filter HTTP checks **passed**. The common-protocol test found a confirmed behavioral difference: empty-player timescale filters are retained by the newer NodeLink, while pinned baseline 804e0d6 ignores them. The revision-sensitive assertion was updated accordingly; the initial run was not fully green. This is not live audio or crossfade proof.

### Additional observation (second candidate CI)

The same modern digest later returned an empty filter map for an empty player instead of the previous timescale object. [Run 45038480695](https://github.com/SebasLoadJs/NyxLink/actions/runs/45038480695) demonstrates that this is not a fixed revision-level behavioral change. The integration suite now accepts only an empty map or the exact requested timescale values and reports which state occurred, while maintaining strict request, local filter persistence, ownership and rollback checks. This case does not certify audible filters after track start.

### Wire format detail

NodeLink 97bbce1 serializes its filter state as `player.filters.filters.timescale` when a timescale filter is present. Lavalink uses `player.filters.timescale`. The latest integration assertions inspect the server-native envelope and require exactly the expected timescale values when present, with an empty-state outcome still allowed for an empty NodeLink player. This is a protocol representation difference; live audio quality remains unverified.

## Current modern-profile acceptance — 2026-11-22

All four NyxLink CI workflows passed at [b9c451e](https://github.com/SebasLoadJs/NyxLink/commit/b9c451eedc1da1c07dd230a73840ddfe3e2fc951): [protocol tests including the pinned modern NodeLink profile](https://github.com/SebasLoadJs/NyxLink/actions/runs/45038936275), [587/587 automated tests and strict Node.js 22/24 compilation](https://github.com/SebasLoadJs/NyxLink/actions/runs/45038936280), [CodeQL](https://github.com/SebasLoadJs/NyxLink/actions/runs/45038936273) and [endurance](https://github.com/SebasLoadJs/NyxLink/actions/runs/45038936360). Modern NodeLink image version string: 3.10.0-dev.2026-11-15.8; immutable source revision 97bbce1.

Modern results are authoritative for **tested REST and WebSocket operations only**. Group music synchronization, crossfaded audio, AutoMix results and Discord voice remain unverified. The previous baseline image and protocol checks are still retained for regression detection.

## Resume checkpoint — 2026-11-23

At `03546fd49faffdaaf9e0ad45e1e9c7439ec749a6`, [backend integration job 138107478444](https://github.com/SebasLoadJs/NyxLink/actions/runs/45293359304/job/138107478444) passed all 26 baseline protocol tests, then failed during the implicit download of the pinned modern NodeLink image in `docker run`. The complete log contains the start of the pull, but no registry error or completed pull. The failure timing is consistent with the harness's 120-second command deadline; the log alone does not establish why the registry download stalled.

The local follow-up separates image availability from container startup. For example, `NYXLINK_NODELINK_PROFILE=modern pnpm run test:backends` still selects the same immutable modern digest. An available local image is reused; a missing pinned image is pulled with a 180-second deadline and at most one retry for recognized transient failures. Authentication, missing manifests, disk exhaustion and unknown errors fail immediately. Locally patched images must already exist. Startup uses `--pull=never`, retains the existing 120-second command deadline, and does not retry backend execution or assertions. Failure reports include the operation, exit/signal or timeout, and bounded output with generated lab credentials redacted.

This follow-up is **implemented and unit tested locally, not verified against Docker or remote CI**. The development machine runs Windows without Docker; the lab also explicitly requires a Linux container host. Re-run baseline and modern protocol suites plus extension and endurance checks on a capable host before accepting a new candidate. See [historical local verification](https://github.com/SebasLoadJs/NyxLink/blob/6a2cedebc0e6a97f52cf778df1b39cc965855bd8/docs/resumption-verification.md).
