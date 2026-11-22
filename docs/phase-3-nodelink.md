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
