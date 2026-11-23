# Changelog

This changelog describes the unreleased NyxLink 5.3 development line and its verified scope. **No GitHub `v5.3.0` tag or npm `5.3.0` stable package has been published.** Changes may still be refined before the release candidate.

## [Unreleased — v5.3]

### Architecture and public API

- Introduced a multi-backend client architecture with explicit Lavalink v4 and NodeLink adapters, capability discovery, connection-scoped inventories, selection constraints and backend-specific contracts.
- Added stronger REST/WebSocket response validation and extension routing that rejects unsupported operations rather than silently sending incompatible payloads.
- Extended playback snapshots, track encoding/resolution, storage contracts and public TypeScript declarations for CommonJS and ESM consumers.

### Playback and reliability

- Hardened play/stop/seek/skip, position acknowledgements, queue and autoplay transitions against stale events and concurrent user commands.
- Made `back()` transactional: previous history and the outgoing queue slot are committed only after backend acknowledgement; failed/aborted back attempts restore the original history and queue state.
- Made positional `skip(index)` restore the selected entry to its original queue position on backend failure or a cancelled playback intent.
- Preserved caller-owned and historical track positions on rejected `play()`, `back()` and positional `skip()` requests; malformed positional queue entries are rejected before removal.
- Reworked `Queue.duplicate()` to create independent `Track` instances with isolated mutable metadata, preventing a seek or retry from changing other queued copies. Duplicate failures leave the original queue unchanged.
- Added atomic input prevalidation for `Queue.add()` and `Queue.insert()`, plus guards for `unshift()` and `replace()`, to prevent invalid JavaScript entries from corrupting persisted queues.
- Reworked `replay()` to use an independent track instance: rejected or cancelled restarts preserve the original playback position, successful restarts do not duplicate history, and immediately queued `seek()` commands retain their intended target.
- Tightened recommendation seed validation for YouTube/YouTube Music and prevented failed or stale autoplay requests from deleting independently queued manual tracks.
- Yielded in-flight autoplay recommendations when a listener queues music during asynchronous source resolution, including when the manually queued item is the same Track instance as the automatic candidate.
- Added rollback- and intent-aware player migration, bounded failover, candidate selection, health monitoring and explicit node maintenance (`drain`/`eject`).
- Added cancellation safeguards for late backend responses, worker failures, voice disconnects, crossfading/gapless transitions and mixed-node recovery.
- Introduced node-identity-scoped session storage and safe fallback for unambiguous legacy endpoint-only resume records.

### NodeLink integration

- Added validated source-health REST responses and real-time events; optional source-aware node selection.
- Added per-player crossfade settings, queue-preload scheduling and recognized nonterminal gapless/crossfade transitions.
- Added supported low-level NodeLink extension routes: stream and format handling, lyrics/captions, groups, SponsorBlock and remote mix operations.
- Introduced a pinned modern NodeLink integration profile alongside the existing baseline.

These APIs only describe **client and tested protocol behavior**; they do not guarantee audible crossfade, AutoMix quality, every provider, or Discord voice playback without additional real-world tests.

### Lavalink integration

- Added capability-gated support for the separately installed LavaLyrics and SponsorBlock plugins, with schema validation and immutable JAR checksums in the integration laboratory.
- Preserved normal Lavalink v4 compatibility when optional plugins are absent.

### Logging and security

- Added opt-in Consola-based logging with system-status and failover reporting. Logging remains silent by default.
- Added basic redaction of known secret fields and authorization tokens; reinforced transport/authentication handling, failure boundaries and test-laboratory security.
- Enabled strict compilation on Node.js 22/24, regression/contract tests, backend integration, CodeQL and endurance validation in GitHub Actions.

### Optional distributed operation (Redis 7)

- Added a caller-owned Redis adapter with atomic player snapshot revision checks and namespaced storage, with no mandatory Redis dependency.
- Added per-guild ownership leases, renewal, expiry detection and fencing tokens; opt-in Player, Voice and REST guards block stale workers without changing unconfigured bots.
- Added an application-routed Discord voice IPC gate with atomic Redis ownership checks, duplicate-command protection, per-guild monotonic sequencing and serialized callbacks on each gateway receiver.
- **IPC wire protocol `nyxlink/guild-voice/2`** requires a Redis-issued `sequence` field. Prior development-only `nyxlink/guild-voice/1` messages are rejected; update IPC senders and receivers together.
- Added Redis 7 integration tests in Node.js 22/24, including cross-process owner transfer, delayed command handling, out-of-order join/leave and replay expiration.
- Redis and IPC checks do not replace an authenticated gateway transport or provide end-to-end fencing for commands already accepted by Discord.

### Live voice acceptance harness

- Added separately armed live Discord command smoke for NodeLink and Lavalink v4: play, backend-confirmed track A, pause/resume, volume, seek, skip and backend-confirmed track B.
- Added a controlled Discord voice disconnect/reconnect acceptance mode on both backends. It verifies a new gateway voice handshake, confirms the active track in REST and explicitly exercises player recovery; it does not simulate a network partition.
- Kept the NodeLink-specific crossfade acceptance mode separate. Unrecognized backends are rejected, and Lavalink is not advertised as implementing NodeLink crossfade.
- Bounded status polling even when the REST request stalls, and sanitized backend version and track-end metadata in local reports.
- Bounded live Discord login, track loading, voice connection, command execution and teardown even when a backend/gateway promise never settles; these failure-timeout checks do not imply audible acceptance.
- **No audible Discord output has been independently certified** by this harness or automated CI.

### Distribution

- Added npm channel policy validation: `dev` for development builds, `next` for release candidates and `latest` for stable SemVer versions.
- Added isolated package-consumer validation for CommonJS, ESM, TypeScript and Discord.js integration, including optional Redis, IPC and private metrics exports.
- Added the derivative `NOTICE.md` to the npm artifact with explicit Moonlink.js origin and a package-integrity check; legal sign-off remains pending.
- Added release acceptance criteria and migration guidance.

### Remaining release blockers

- All validation jobs must pass on the **same final candidate commit**; previously passed historical runs are not sufficient.
- Controlled real Discord voice and audible playback/reconnect testing has not been certified.
- Final dependency/license review, candidate `npm pack` verification, release notes and npm publication require explicit acceptance.
- Stable version number, branch and tag must only be finalized after these checks.

See [release-5.3-plan.md](docs/release-5.3-plan.md), [backend-compatibility.md](docs/backend-compatibility.md), [live-voice-verification.md](docs/live-voice-verification.md) and [migration guide](docs/migrating-from-moonlink.md).

## Previous stable line

The repository's stable source branch is `v5.2`. This changelog does not reconstruct or replace its upstream release history; consult that branch's Git history and release records for exact historical changes.
