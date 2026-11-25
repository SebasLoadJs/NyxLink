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
