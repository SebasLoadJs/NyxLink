# Backend compatibility matrix — verified baseline

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
