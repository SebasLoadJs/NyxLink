# Final backend parity and maintenance policy

Scope: a stable TypeScript/JavaScript client for Lavalink v4 and NodeLink. Keep both native protocol contracts and the shared player lifecycle. No native Discord voice engine, third audio backend, media extraction engine or OBEY-specific catalog inside NyxLink.

## Completion gates

| Workstream | Acceptance before release |
| --- | --- |
| Search and discovery | Typed LavaSearch and NodeLink search modifiers; canonical track, album, artist, playlist and suggestion results; accurate provider capabilities and bounded cancellation; preserve source errors. |
| Sources | Retain existing compatibility; prioritize Amazon Music, Last.fm, Shazam and Songlink; no new regional sources required. Provider playback versus metadata/mirroring must remain explicit. |
| Backend parity | Versioned capability/endpoint/event matrix for Lavalink core, LavaSrc, LavaSearch, LavaLyrics, SponsorBlock, LavaDSPX, YouTube plugin and NodeLink extensions. Verify unsupported features fail before transport. |
| Extended playback | Crossfade, AutoMix, gapless, fading/ducking, mixer, extra filters, audio track selection, normalization and Holo metadata; verify actual supported contracts rather than claiming native Lavalink parity. |
| Recovery | Restore common playback state; explicitly report unavailable destination capabilities; preserve preferences without replaying stale intent. Real two-backend voice acceptance. |
| Recommendations | Bounded provider queries, preference hook, deduplication, cancellation and explicit failure handling. |
| SDK and Aurora | Preserve public contracts; typed extension boundaries, one canonical logging engine, redact secrets, optional presentation and telemetry. |
| Quality | Strict types, Node 22/24, protocol/plugin integration, Redis/IPC, packaging, security, soak and human audio acceptance. No test result inferred from a file's existence. |

## Maintenance after stabilization

- Keep changes additive unless a major-version change is justified. Treat upstream wire contracts, not UI or product requests, as the primary reason to change SDK features.
- Pin upstream revisions and plugin fixtures for reproducibility. Review upstream API changes and run regression suites before accepting new versions.
- Do not freeze security updates, Discord voice requirements, runtime compatibility or confirmed bug fixes while waiting for backend changes.
- No publication or production rollout based on protocol success alone. Follow the existing release gates and pending real-world acceptance.
- Each missing contract must be implemented with its tests or explicitly documented as unsupported; do not claim all future plugin APIs are supported.

This document is a scope and acceptance policy, not evidence that every row has been implemented. The initial branch adds LavaSearch transport/validation and selected search routing; all other gates require separate code-level verification.

### Native audio recovery

On migration, the shared playback state is restored independently of NodeLink-only controls. Native fading, crossfade, loudness normalization, audio track selection and extended filters are projected against the destination. Unsupported settings are retained in the live player and omitted from recovery requests; compatible destinations can receive them again. The recovered `playerNodeFailover` report optionally includes `suspendedFeatures` and `manualPreloadDiscarded`. Queue-backed preloads are rebuilt rather than reusing stale source-node encodings.

Explicit native controls remain capability-gated. Applications can use `filters.apply({ compatibleOnly: true })` to apply the compatible subset while preserving the original filter preferences. This is not a guarantee of audible continuity. Plugin-specific filter compatibility, mixer-layer reconstruction and real backend/voice acceptance still require separate verification.

### Optional mixer reconstruction

The NodeLink mixer API supports creating, listing, updating volume and deleting layers, but not seeking an individual layer. Consequently, mixer recovery is disabled by default. Applications that explicitly want layers restarted from their beginning can set Manager option `node.mixRecovery: { mode: 'restart', maxLayers: 5 }`.

Recovery reads an authoritative list from the source, never resurrects layers from old cached state, skips expired snapshots and layers, and attempts reconstruction only after the main player migration commits and source cleanup is acknowledged. It skips paused, unavailable or incompatible destinations. Each new layer receives its own destination ID; the optional `playerNodeFailover.mixRecovery` report identifies acknowledged ID mappings and failed/skipped counts. No automatic retry is made after an ambiguous creation request. A source that cannot be queried cannot provide a trustworthy list of layers.

Contract reviewed against [NodeLink mixer collection API](https://github.com/PerformanC/NodeLink/blob/97bbce1e169f18811c69836e3d0fa7f87e1d13fe/src/api/sessions.id.players.id.mix.ts) and [individual layer API](https://github.com/PerformanC/NodeLink/blob/97bbce1e169f18811c69836e3d0fa7f87e1d13fe/src/api/sessions.id.players.id.mix.id.ts). Real audio acceptance remains required.