# Changelog

This changelog describes the unreleased NyxLink 5.3 development line and its verified scope. **No GitHub `v5.3.0` tag or npm `5.3.0` stable package has been published.** Changes may still be refined before the release candidate.

## [Unreleased — v5.3]

### Test infrastructure

- Separated digest-pinned backend image downloads from container startup. Cached images need no download; transient pull failures get at most one retry with a dedicated 180-second deadline per attempt. Container starts and protocol assertions are never retried by this helper; missing locally patched images fail without registry fallback.
- Added bounded container failure diagnostics with timeout classification and redaction of generated lab passwords, instead of printing credential-bearing command arguments.
- Fixed Windows package checks to execute installed npm/pnpm JavaScript CLIs through Node without a shell, avoiding `spawnSync npm.cmd EINVAL` while preserving argument boundaries.

### Architecture and public API

- Checkpoint in progress: optional Pino/OpenTelemetry transports, bounded performance observations, caller preference scoring for autoplay, observed startup layouts and truecolor controls. Added opt-in backend search coalescing and metadata fallback; final acceptance and full requirement reconciliation remain in `docs/CONTINUAR-AQUI.md`.

- Added opt-in weighted node costs from observed latency, fresh CPU/memory/player statistics and configured priority, with caller-scoped hysteresis that cannot bypass eligibility or source/region preferences. Existing strategies retain their defaults.
- Extracted queue-preload eligibility and coalescing/backoff from Player; player commands retain ownership of reservations, serialized updates and backend acknowledgments.

- Extracted the worker/special-voice recovery transaction into a shared internal module, preventing nested restart failures from destroying a newer user intent and preserving retry budgets on unacknowledged recovery.
- Added optional trusted extension setup/dispose with typed isolated event hooks, AbortSignal, lifecycle deadlines and manager-owned shutdown.
- Introduced a multi-backend client architecture with explicit Lavalink v4 and NodeLink adapters, capability discovery, connection-scoped inventories, selection constraints and backend-specific contracts.
- Added stronger REST/WebSocket response validation and extension routing that rejects unsupported operations rather than silently sending incompatible payloads.
- Extended playback snapshots, track encoding/resolution, storage contracts and public TypeScript declarations for CommonJS and ESM consumers.

### Playback and reliability

- Hardened telemetry correlation: stale READY/TrackStart events cannot consume newer latency samples, and orphan/duplicate recovery events do not inflate success counters.
- Enforced provider policy across cross-backend track resolution: blocked sources are not queried or accepted, explicit provider errors (including rate-limit/auth failures) are never bypassed through metadata fallback, and malformed direct responses fail explicitly.
- Bounded cross-backend metadata fallback to a single elapsed-time deadline shared by all eligible search sources, instead of allowing one timeout per source.
- Forwarded playback-intent cancellation to destination URI and metadata lookups on new play/stop/migration; regression tests cover pending HTTP requests, queued music and migration ownership.
- Rejected stale shared-search responses after node/session replacement and checked independent subscriber cancellation.

- Prevented a late `setVolumeAsync` acknowledgment or failure from committing state after player destruction or backend/session replacement; cancelled operations report a typed cancellation.

- Hardened play/stop/seek/skip, position acknowledgements, queue and autoplay transitions against stale events and concurrent user commands.
- Made `back()` transactional: previous history and the outgoing queue slot are committed only after backend acknowledgement; failed/aborted back attempts restore the original history and queue state.
- Made positional `skip(index)` restore the selected entry to its original queue position on backend failure or a cancelled playback intent.
- Preserved caller-owned and historical track positions on rejected `play()`, `back()` and positional `skip()` requests; malformed positional queue entries are rejected before removal.
- Reworked `Queue.duplicate()` to create independent `Track` instances with isolated mutable metadata, preventing a seek or retry from changing other queued copies. Duplicate failures leave the original queue unchanged.
- Added atomic input prevalidation for `Queue.add()` and `Queue.insert()`, plus guards for `unshift()` and `replace()`, to prevent invalid JavaScript entries from corrupting persisted queues.
- Protected normal `Player.play()` against malformed track resolver results by normalizing the selected track before consuming its queue entry; a rejected resolution leaves the original track available to retry.
- Verified serialized queue metadata before accepting a new item, rejecting circular structures instead of silently persisting a partial or unusable queue snapshot.
- Prevented infinite replay of failed sources with `loop=track` and `loop=queue`: only a normally `finished` track is eligible for looping; `loadFailed` now obeys bounded retries and otherwise advances or ends the queue.
- Queue-loop now clones a finished track before re-enqueuing it, preserving history position and user metadata independently of the next iteration.
- Track-loop end handling now uses `Player.replay()` instead of a raw backend PATCH, so successful loop restarts update in-memory playing and position state after acknowledgement without appending duplicate history. Rejected restarts do not consume manually queued songs.
- Reworked `replay()` to use an independent track instance: rejected or cancelled restarts preserve the original playback position, successful restarts do not duplicate history, and immediately queued `seek()` commands retain their intended target.
- Tightened recommendation seed validation for YouTube/YouTube Music and prevented failed or stale autoplay requests from deleting independently queued manual tracks.
- Yielded in-flight autoplay recommendations when a listener queues music during asynchronous source resolution, including when the manually queued item is the same Track instance as the automatic candidate.
- Added rollback- and intent-aware player migration, bounded failover, candidate selection, health monitoring and explicit node maintenance (`drain`/`eject`).
- Added cancellation safeguards for late backend responses, worker failures, voice disconnects, crossfading/gapless transitions and mixed-node recovery.
- Introduced node-identity-scoped session storage and safe fallback for unambiguous legacy endpoint-only resume records.

### NodeLink integration

- Added typed mix create/list contracts, runtime response/input validation, 0..1 mix-volume enforcement and serialized Player mix commands with explicit stale-lifecycle cancellation.
- Added validated source-health REST responses and real-time events; optional source-aware node selection.
- Added per-player crossfade settings, queue-preload scheduling and recognized nonterminal gapless/crossfade transitions.
- Added supported low-level NodeLink extension routes: stream and format handling, lyrics/captions, groups, SponsorBlock and remote mix operations.
- Introduced a pinned modern NodeLink integration profile alongside the existing baseline.

These APIs only describe **client and tested protocol behavior**; they do not guarantee audible crossfade, AutoMix quality, every provider, or Discord voice playback without additional real-world tests.

### Lavalink integration

- Added capability-gated support for the separately installed LavaLyrics and SponsorBlock plugins, with schema validation and immutable JAR checksums in the integration laboratory.
- Preserved normal Lavalink v4 compatibility when optional plugins are absent.

### Logging and security

- Added a bounded opt-in structured logging pipeline with injectable destinations, newline-delimited JSON, child context, async correlation/spans, timeline filters, profiles/layouts, sampling/group summaries and explicit flush/close.
- Added bounded getter-free credential redaction, transport backpressure/timeout isolation, drop/error counters, grounded diagnostics and optional observed cluster/source/runtime snapshots. NO_COLOR, ASCII and narrow-terminal rendering are supported.
- Exposed aggregate logger diagnostics only through the existing authenticated private metrics service; no message history or guild labels are exported.
- Added bounded Player trace rendering and observed migration-stage records, including partial rollback/source-cleanup failures; pretty layouts now distinguish selected versus full context without repeating whole failover panels per stage.
- Added sanitized spans for all buffered Rest requests and stream openings while preserving transport overloads/results and redacting raw error bodies.
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

- Added a safe five-scenario operator runner with literal private env files, no-network configuration validation, explicit arming, clean-SHA evidence and fail-fast execution. Added original WAV fixture generation and a Spanish operator handoff; real voice tests remain for the responsible operator.
- Added an explicitly armed 24–72-hour isolated protocol-soak runner with a single continuous worker, bounded watchdog, unique private reports and clean-source evidence. The normal endurance command retains its two-hour limit; the long soak has not been executed during implementation.
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
