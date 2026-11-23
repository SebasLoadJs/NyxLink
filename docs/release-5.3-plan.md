# NyxLink 5.3 — master completion and stable release gate

Status: **in progress**, development branch `dev`. This document is the acceptance contract; it is **not** a claim that the release is ready. Stable branch `v5.2` must remain unchanged during stabilization.

## Target and versioning

- Development: `0.1.0-dev.N`, npm dist-tag `dev`.
- Release candidate: `5.3.0-rc.1` (increment as needed), npm dist-tag `next`.
- Stable: GitHub branch `v5.3`, immutable Git tag / GitHub Release `v5.3.0`, npm `nyxlink@5.3.0` with dist-tag `latest`.
- None of these version changes or publications should be executed before all required gates pass.
- A version number or green unit test alone **does not** certify audible Discord playback, crossfade quality, AutoMix, or every NodeLink provider.

## Phase 1 — Playback correctness

- [ ] TypeScript strict build and all automated regression tests pass on Node.js 22 and 24.
- [ ] Confirm play/stop/seek/skip ordering and async acknowledgments (including overlapping commands).
- [ ] Confirm queueEnd, autoplay, autoLeave, loop, shuffle and user override cases, including failed provider calls.
- [ ] Confirm pause, volume, filters, stored snapshots, position and replay behavior after restart.
- [ ] Confirm crossfade/gapless transitions do not trigger false queueEnd or destroy a live player.
- [ ] Include deterministic tests for cancellation and late old-node events.

## Phase 2 — Lavalink and NodeLink protocol coverage

- [ ] Real isolated Lavalink v4 and baseline NodeLink integration jobs pass.
- [ ] Modern pinned NodeLink profile and dedicated modern contract tests pass.
- [ ] Validate backend detection, supported capabilities and explicit fallback/unsupported responses.
- [ ] Validate REST + WebSocket lifecycle, source health, track load/decode, authentication and reconnect.
- [ ] Validate NodeLink extension contracts where supported: stream, queue preload, crossfade, mix, chapters, captions, lyrics, groups and SponsorBlock; do not claim support solely from API names.
- [ ] Validate Lavalink plugins with real pinned installations (LavaLyrics, SponsorBlock).
- [ ] Record exact backend revision/digest and evidence for every acceptance result.

## Phase 3 — Recovery and multi-node resilience

- [ ] Test migration success, position and paused-state retention, and source/target cleanup.
- [ ] Test failed restore, partial persistence, rollback, cancelled migrations, destroyed/replaced nodes and concurrent guild recoveries.
- [ ] Test double socket-close and reconnect-during-transfer races.
- [ ] Test node selection under load, capability restrictions, draining, circuit breaker, retries and queue backpressure.
- [ ] Confirm a failed transfer cannot produce duplicate active sessions or false `recovered` events.
- [ ] Verify resume vs failover behavior after reconnect with real backend labs.

## Phase 4 — Architecture, dependencies, logging and security

- [ ] Review and remove stale Moonlink naming only where it is part of public user-facing product identity; preserve documented compatibility contracts.
- [ ] Review all exports, module boundaries, error semantics and Node.js runtime requirements.
- [ ] Keep logging opt-in and silent by default; redact known sensitive credentials and test it.
- [ ] Define structured logging and an optional Pino adapter if justified; do not install Pino, pino-pretty and Chalk merely to duplicate Consola's functionality.
- [ ] Review timeout/cancellation policies, input validation, request handling and local database writes.
- [ ] Dependency security audit, CodeQL and license/attribution review (including original Moonlink contributors).
- [ ] Review benchmark and memory/connection leak evidence.

## Phase 5 — Public consumption and documentation

- [ ] `pnpm run test:package` installs and exercises the *packed* package in an isolated consumer.
- [ ] `pnpm run pack:check` verifies the archive contains no private/runtime files.
- [ ] Both CommonJS and ESM consumers, TypeScript declaration imports and discord.js examples pass.
- [ ] README, API docs, compatibility matrix, installation examples, migration guide and CHANGELOG match shipped code.
- [ ] Build version/channel validation accepts `dev`, `next` and `latest` only for matching SemVer versions.
- [ ] Release notes explicitly disclose untested voice providers and any backend-specific limitations.

## Phase 6 — Release candidate and stable publication

- [ ] CI pipelines are green at one immutable candidate commit. Record commit SHA and run URLs.
- [ ] Run local-backend endurance for >= 600 seconds without leaks/regressions (short smoke tests are not sufficient).
- [ ] Perform controlled real Discord voice playback/seek/skip/pause/volume/reconnect tests with authorized test infrastructure.
- [ ] Publish an *explicitly approved* candidate `5.3.0-rc.1` to npm `next` and verify a fresh installation.
- [ ] Freeze candidate, address release blockers, and repeat all changed-area tests.
- [ ] Create `v5.3` branch and `v5.3.0` Git tag/Release from the exact approved commit.
- [ ] Publish npm `5.3.0` to `latest` with explicit approval and verify `npm view nyxlink version` and clean consumer installation.

### Mandatory commands

```sh
pnpm install --frozen-lockfile
pnpm run typecheck:strict
pnpm run test:coverage
pnpm run test:types
pnpm run test:package
pnpm run pack:check
pnpm audit --prod --audit-level=high
NYXLINK_CONTAINER_ENGINE=docker pnpm run test:backends
NYXLINK_CONTAINER_ENGINE=docker NYXLINK_NODELINK_PROFILE=modern pnpm run test:backends
NYXLINK_CONTAINER_ENGINE=docker pnpm run test:extensions
NYXLINK_CONTAINER_ENGINE=docker pnpm run test:lavalink-plugins
NYXLINK_CONTAINER_ENGINE=docker pnpm run test:endurance -- 600
```

Read previous results at `docs/backend-compatibility.md`; historic green runs are not proof that the **latest** `dev` head passes.

### Stop conditions

Do not tag or publish while any required CI job is failing or unverified, while known critical/high-severity problems remain, if a backend path is silently misreported as supported, or if the release package/installation does not pass. Every unchecked item requires evidence or an explicitly documented scope reduction before a stable release.
