# NyxLink 5.4 development — upstream contract audit

The 5.3.0 GitHub release and its RC tags are historical and immutable. Proposed 5.4.0 is additive; final numbering depends on npm inventory and API compatibility. The package is not released by this document.

| NodeLink upstream proposal | SDK status at this revision |
| --- | --- |
| #265 rich media | Optional, detached typed `Track.getNodeLinkMediaMetadata()` and standalone reader implemented; external `/v4/loadmedia` route not integrated |
| #266 advanced lyrics | Existing raw response/events preserve payload; advanced types and validation pending |
| #267 visualization | Optional server player JSON snapshot contract reviewed; SDK reader pending |
| #268 analysis | Optional processed-output snapshot contract reviewed; SDK reader pending |
| #269 Protected processing | Existing normalizer boolean does not establish new server options/telemetry; telemetry contract pending |
| #270 AutoMix safety | Server-internal corrections; client transition compatibility and real playback tests pending |

These are open upstream proposals, not a promise of availability in an official NodeLink version. No new audio-processing responsibilities are moved into NyxLink. Use an exact pinned fork revision for experimental integration, never silently assume unsupported features. Do not fetch provider URLs server-side without separate security/egress policy. A metadata reader does not guarantee artwork availability or playback.

The next release must preserve 5.3 API compatibility, regenerate public declarations and verify unit, packaging, real backend, voice, endurance and npm registry evidence on the exact release commit. No historical tags should be moved. The npm publication workflow remains validation-only.
