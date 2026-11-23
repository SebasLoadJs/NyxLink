# NyxLink 5.3 — master completion and stable release gate

Status: **in progress**, development branch `dev`. For the 38 original tasks, phase mapping and evidence see [Master plan reconciliation](master-plan-reconciliation.md); the present document is the stable-release acceptance gate. This document is the acceptance contract; it is **not** a claim that the release is ready. Stable branch `v5.2` must remain unchanged during stabilization.

## Target and versioning

- Development: `0.1.0-dev.N`, npm dist-tag `dev`.
- Release candidate: `5.3.0-rc.1` (increment as needed), npm dist-tag `next`.
- Stable: GitHub branch `v5.3`, immutable Git tag / GitHub Release `v5.3.0`, npm `nyxlink@5.3.0` with dist-tag `latest`.
- None of these version changes or publications should be executed before all required gates pass.
- A version number or green unit test alone **does not** certify audible Discord playback, crossfade quality, AutoMix, or every NodeLink provider.

For the exact sequence of RC tag creation, npm `next` installation checks, human voice approval and final `latest` publication, follow [the 5.3 candidate release runbook](release-5.3-rc-runbook.md). Its steps do not authorize publication or waive the gates below.

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
- [ ] Dependency security audit, CodeQL and license/attribution review (including original Moonlink contributors); confirm `NOTICE.md` is shipped and complete `docs/license-attribution-review.md`.
- [ ] Review benchmark and memory/connection leak evidence.

## Phase 5 — Public consumption and documentation

- [ ] `pnpm run test:package` installs and exercises the *packed* package in an isolated consumer.
- [ ] `pnpm run pack:check` verifies the archive contains no private/runtime files and includes `NOTICE.md` and `LICENSE`.
- [ ] Both CommonJS and ESM consumers, TypeScript declaration imports and discord.js examples pass.
- [ ] README, API docs, compatibility matrix, installation examples, migration guide and CHANGELOG match shipped code.
- [ ] Build version/channel validation accepts `dev`, `next` and `latest` only for matching SemVer versions.
- [ ] Release notes explicitly disclose untested voice providers and any backend-specific limitations.

## Phase 6 — Release candidate and stable publication

- [ ] CI pipelines are green at one immutable candidate commit. Record commit SHA and run URLs.
- [ ] Run local-backend endurance for >= 600 seconds without leaks/regressions (short smoke tests are not sufficient).
- [ ] Perform controlled real Discord voice tests with authorized infrastructure: `--armed --commands` and `--armed --reconnect` on NodeLink, `NYXLINK_LIVE_BACKEND=lavalink --armed --commands` and `NYXLINK_LIVE_BACKEND=lavalink --armed --reconnect` on Lavalink; use the default `--armed` mode for NodeLink crossfade. Preserve the private reports and independent audible observations.
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


## Verified CI checkpoint — 2026-11-23

**Reference commit:** `7fd5c143ab00d82a1d03bdd8c4509898987ff4df` (the `dev` head when these checks ran). These are executed checks, not merely test files or syntax validation.

| Gate | Result | Evidence |
| --- | --- | --- |
| Strict TypeScript, Node.js 22 and 24 | Passed | [Validate NyxLink](https://github.com/SebasLoadJs/NyxLink/actions/runs/45103453543) |
| Automated coverage, public TypeScript API, isolated npm package consumer, pack contents and production dependency audit | Passed on both versions | [Validate NyxLink](https://github.com/SebasLoadJs/NyxLink/actions/runs/45103453543) |
| Lavalink and baseline NodeLink protocol/extension labs | Passed | [Backend integration](https://github.com/SebasLoadJs/NyxLink/actions/runs/45103453608) |
| Pinned modern NodeLink protocol and extension labs | Passed | [Backend integration](https://github.com/SebasLoadJs/NyxLink/actions/runs/45103453608) |
| Real pinned Lavalink plugin integration | Passed | [Backend integration](https://github.com/SebasLoadJs/NyxLink/actions/runs/45103453608) |
| CodeQL | Passed | [CodeQL](https://github.com/SebasLoadJs/NyxLink/actions/runs/45103453601) |
| Local backend endurance and extended stabilization workflow | Passed | [Extended endurance](https://github.com/SebasLoadJs/NyxLink/actions/runs/45103453662) |

**Scope limitations:** isolated backend protocol tests do **not** certify audible playback in Discord voice, quality of live crossfade, AutoMix recommendation relevance, every external provider, or a published npm stable installation. For exact supported endpoint behavior, use `docs/backend-compatibility.md` and the uploaded evidence artifacts.

**Remaining release blockers:** run and document controlled real Discord voice tests (play, seek, skip, pause, volume, reconnect, crossfade where supported); finish documentation and migration/release notes; review license/attributions; prepare an explicitly approved release candidate; validate the candidate package from npm `next`; repeat acceptance checks for its immutable commit; then publish the approved GitHub and npm stable artifacts. Do not substitute successful workflows on an older SHA for the final candidate.

## Recovery stabilization checkpoint — 2026-11-22

The following implementation changes are committed on `dev`, but their latest commit is **not yet certified by a full successful CI run**:

- Node disconnect and disaster-recovery player selection now use **exact Node object ownership**, not a host/port-derived UUID. This prevents different Node instances sharing an endpoint from cross-recovering one another's players.
- Socket-close recovery now isolates throwing event observers, duplicate closes and old callbacks that resume after a connection has been restored.
- Session disaster recovery now distinguishes the real `restart()` outcome from an observer exception; a changed node owner does not receive an obsolete success event.
- NodeManager eject isolates per-guild failover rejections and orphan cleanup rejections, keeping a node registered if cleanup is incomplete.
- Ejection records failed transfers that left a player on a now-disconnected target, rather than hiding the orphan.
- Regression tests were added in `tests/node-disconnect-recovery.test.cjs` and `tests/node-failover.test.cjs`.

**Additional lifecycle hardening (2026-11-22, later commits):**
- Drain/eject only accept recovery when the player has a live, registered owner. False success ACKs, disconnected targets and rejected cleanup operations cannot silently complete an evacuation.
- Disconnect notifications close the **captured old socket**, not an instance that a listener may have installed during reconnection.
- Node resume persistence is now scoped to the node identifier as well as its endpoint. A uniquely configured node may read its old host/port-only session; concurrent instances with the same endpoint never import that ambiguous legacy session.
- Added regression tests for stale socket notifications, drain/eject outcomes, cross-instance resume records and legacy fallback.

**Still required:** TypeScript build, all unit/contract tests, baseline and modern NodeLink labs, Lavalink plugin lab, endurance, security audit, package-consumer tests and controlled Discord voice acceptance for the final release commit. No release tag, npm stable version or publication is implied by this checkpoint.

## CI and playback stabilization checkpoint — 2026-11-23 (later)

**Fully green reference:** `d1048b0454892a9544045ccbeb7c324c80220f3f` had all **11 GitHub Actions checks successful**, including Node 22/24 strict builds, coverage, installed-package consumers, baseline and modern NodeLink protocols, pinned Lavalink plugins, Redis 7, endurance and CodeQL. Evidence: [validate and backend](https://github.com/SebasLoadJs/NyxLink/actions/runs/45266840340), [protocols](https://github.com/SebasLoadJs/NyxLink/actions/runs/45266840415), [Redis](https://github.com/SebasLoadJs/NyxLink/actions/runs/45266840434), [endurance](https://github.com/SebasLoadJs/NyxLink/actions/runs/45266840194) and [CodeQL](https://github.com/SebasLoadJs/NyxLink/actions/runs/45266840197). These checks verify the cited SHA only.

**Subsequent fixes on `dev`:**
- Autoplay insertion ownership: preserve manually queued tracks across stale or failed REST acknowledgements; tests exercise stop, queue contention, backend failure and command serialization.
- `back()`: retain the current song, queue and prior history until playback succeeds; do not consume history or queue the outgoing song on failed/aborted acknowledgements.
- Positional `skip(index)`: restore the selected queue entry to its original order if the request is rejected or superseded; cover both success and stop races.
- Regression tests and changelog updated; see commits `c8b0203` and `7f09559`.

**Gate remains open:** later code changes must pass **all** checks on their final SHA. No automated job establishes independently audible Discord output, real crossfade quality, network-partition continuity or legal/publication approval. Do not treat documentation-only updates as a release candidate.

### Stop conditions

Do not tag or publish while any required CI job is failing or unverified, while known critical/high-severity problems remain, if a backend path is silently misreported as supported, or if the release package/installation does not pass. Every unchecked item requires evidence or an explicitly documented scope reduction before a stable release.

## Release-gate verification checkpoint — 2026-11-23 (20:00 PYT)

**Verified automatic baseline:** commit `2763ab98515a4bf46bb3e23be0ae0e8b444c5338` passed **11/11 GitHub Actions checks**: Node 22/24, backend protocols/integrations (baseline and modern NodeLink, pinned Lavalink plugins), Redis 7, CodeQL and baseline endurance. [Validation and backend evidence](https://github.com/SebasLoadJs/NyxLink/actions/runs/45284983084), [protocol tests](https://github.com/SebasLoadJs/NyxLink/actions/runs/45284982838), [Redis tests](https://github.com/SebasLoadJs/NyxLink/actions/runs/45284983123). These results apply only to that commit.

**Earlier completed extended endurance:** commit `1e270a9d15039df103f395e44b0dee45f8399162` passed the separate `stabilization / endurance` GitHub check configured with `seconds: '600'`, along with the other 11 checks. This is a historical 600-second acceptance, **not** a substitute for the new RC commit.

**More recent release safety implementation:** read-only npm version-collision preflight is now included in both manual package validation and RC/stable tag validation; automated workflow regression tests assert tag matching, 600-second gate wiring, and no automatic publication. These commits require their own completed GitHub CI check before being considered verified. Recording this checkpoint triggers a fresh extended stabilization run for the updated development source.

**Unchanged stop conditions:** no `v5.3.0-rc.1` Git tag or npm publication before final same-SHA CI, candidate 600-second endurance, authorized and independently heard real Discord playback (NodeLink and Lavalink), package/license attribution sign-off, npm owner/write permission and explicit publication approval.

## Queue isolation and recovery checkpoint — 2026-11-23

**Fully green pre-recovery checkpoint:** commit `8b030bfb4cf28a0eb4ca1ff2b49f9fbf44639a84` completed **11/11** GitHub Actions checks. This includes the Node 22/24 package validation, baseline and modern NodeLink, Lavalink plugins, Redis 7, CodeQL and automated endurance. This result applies only to that commit.

**Subsequent changes awaiting same-SHA acceptance:** `Player.play()` now constructs any resolved Track before removing its queued source entry; malformed external resolver data can be retried instead of silently consumed. Queue ingress additionally validates JSON serializability to reject cyclic user metadata before mutating persistent queue state. Regression tests cover malformed resolution, recovery by retry, circular metadata, and successful nested metadata persistence.

**Extended-gate recheck:** this documentation update intentionally triggers the standalone 600-second `stabilization / endurance` workflow on the resulting `dev` commit. Await its actual conclusion and the other checks before describing the updated HEAD as green. The RC tag and npm packages remain unpublished, and authenticated Discord voice acceptance, license/asset attribution sign-off, and authorized npm publisher verification are still mandatory.
