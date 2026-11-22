# Phase 1 — Stabilization audit

Status: strict stabilization baseline verified; extended local endurance verification pending. Green CI is not proof of production audio continuity. No npm release or stable branch update is part of this baseline.

## Quality gates

- `pnpm run typecheck` — mandatory strict full-source TypeScript validation on Node.js 22 and 24. The compiler configuration enables `strict: true` for all source files; there are no per-module exclusions.
- `pnpm run typecheck:strict` — retained explicit strict audit command for consumers and maintainers.
- `pnpm run test:types` — strict compilation of consumer-facing API contracts.
- `pnpm run test:coverage` — regression tests and coverage.
- `pnpm run test:backends` — local backend protocol integration.
- `pnpm run test:endurance` — endurance workload.
- `pnpm run test:package` and `pnpm run pack:check` — published package contract.
- `pnpm audit --prod --audit-level=high` — production dependency audit (also in Validate NyxLink CI).

## Verified baseline — 2026-11-22

Source commit: [92e2cbb061fe42be553ed0739b372bf8d1bc7f95](https://github.com/SebasLoadJs/NyxLink/commit/92e2cbb061fe42be553ed0739b372bf8d1bc7f95).

| Check | Verified result |
| --- | --- |
| Strict source typecheck | Zero diagnostics on Node.js 22 and 24 |
| Regression suite | 529/529 passed on Node.js 22; validation on Node.js 24 also passed |
| Package contract / consumer types | Passed on both Node versions |
| Production dependency audit | No known vulnerabilities reported by pnpm audit in the recorded run |
| CodeQL | Workflow passed |
| Real local v4 protocol lab | 26/26 tests passed; REST, WebSocket, authentication, reconnection and both migration directions (without live Discord voice) |
| Extension lab | NodeLink extension enabled/disabled scenarios passed |
| Endurance | 60 cycles and 3 session resumes per backend at the 59-second checkpoint; final report passed at 61.0 seconds |

Evidence: [Validate NyxLink](https://github.com/SebasLoadJs/NyxLink/actions/runs/44987333868), [CodeQL](https://github.com/SebasLoadJs/NyxLink/actions/runs/44987333890), [backend protocols and extensions](https://github.com/SebasLoadJs/NyxLink/actions/runs/44987333880), [endurance](https://github.com/SebasLoadJs/NyxLink/actions/runs/44987333879).

The audited backend versions are Lavalink 4.2.2 and NodeLink 3.10.0-dev.2026-10-20.1, not an assertion that every newer server release is compatible.

## Compatibility notes for consumers

- Strict compilation does not imply that all legacy dynamic contracts are fully typed. Existing permissive extension APIs remain subject to a later API audit.
- `Track` fields projected by `trackPartial` (including duration, identifier and URI) are optional. Use `track.getInfo()` for complete retained wire metadata; `toJSON()` now preserves it. Application code compiled in strict mode must narrow optional fields before use.
- `Node.socket` is nullable/optional when the transport is absent. `ping()` rejects when no transport is available.
- `Manager.database` rejects access before assignment; initialize the manager before use. A missing gateway sender throws a descriptive error until a connector or sender is provided.
- `playerTriggeredSkip` may have a null previous track. Filter volume and player volume are separate controls.
- WebSocket redirects are same-origin only; insecure TLS downgrade is forbidden. Buffered HTTP responses have a decoded size limit; audio streaming uses a separate transport.
- NodeLink-specific extensions remain explicitly gated; a backend identification alone does not prove all optional endpoints are enabled.
- The phase-2 registry should distinguish advertised, observed and unknown capabilities. Plugin availability must not be inferred solely from a backend name.
- These changes require migration notes before a public release even though no existing exports were intentionally removed.

## API boundaries

Stable consumer-facing candidates: Manager, Node, Player, Queue, Track, Filters, SearchResult, Connectors and the configuration/type contracts exported from index.ts.

Advanced public exports currently include backend adapters, detection, node selection, failover, health, circuit breaker, storage/snapshot APIs, track codec/resolver, REST and WebSocket, voice receiver, live chat and native metadata providers. Existing exports are retained; API removals require documented deprecation and a compatible release plan.

Internal lifecycle mechanisms should remain behind public contracts: playback attempts and guards, player command scheduling, recovery admission, session synchronization and migration transaction logic.

## Dependency baseline

Runtime dependency: consola 3.4.2. Lockfile resolves TypeScript 5.9.3, @types/node 24.12.2 and discord.js 14.26.2 as development dependencies. Keep the current lockfile frozen; no new mandatory dependencies were introduced by this audit. Preserve OSL-3.0 and upstream attribution.

## Remaining exit criteria

- [x] Green CI for the verified baseline on Node.js 22 and 24.
- [x] Mandatory strict compiler gate; diagnostics decreased 88 → 44 → 14 → 1 → 0.
- [x] Initial corrective audit of ownership, transport, storage, queues, events, recovery and shutdown.
- [x] Initial API compatibility notes and explicit tested backend scope.
- [ ] Extended local endurance gate (600 seconds on the stabilization workflow, plus the existing manual 10–7200 second option).
- [ ] Review extended evidence and record baseline acceptance before starting phase 2.

Production/release gates remain separate: controlled 24–72 hour soak, audible Discord voice tests, failover during actual playback in both directions, additional backend/plugin versions, and deeper critical-path coverage. No claim of production readiness or complete elimination of bugs is warranted.

No new backend features should be mixed into corrective commits without a specific reason.

## Extended endurance

The ordinary push/PR workflow keeps its short 60-second smoke workload. The path-scoped `Extended stabilization endurance` workflow calls the same isolated lab for 600 seconds when this audit report or its workflow changes. Its results are independent of the earlier 60-second baseline. Maintainers may run the existing endurance workflow manually for up to 7200 seconds. These checks do not send Discord gateway packets or verify audible playback.
