# Phase 1 — Stabilization audit

Status: in progress. CI success validates the existing test suite; it is not a proof of production audio continuity.

## Quality gates

- `pnpm run typecheck` — mandatory strict full-source TypeScript validation on Node.js 22 and 24. The compiler configuration enables `strict: true` for all source files; there are no per-module exclusions.
- `pnpm run typecheck:strict` — retained explicit strict audit command for consumers and maintainers.
- `pnpm run test:types` — strict compilation of consumer-facing API contracts.
- `pnpm run test:coverage` — regression tests and coverage.
- `pnpm run test:backends` — local backend protocol integration.
- `pnpm run test:endurance` — endurance workload.
- `pnpm run test:package` and `pnpm run pack:check` — published package contract.
- `pnpm audit --prod --audit-level=high` — production dependency audit (also in Validate NyxLink CI).

## API boundaries

Stable consumer-facing candidates: Manager, Node, Player, Queue, Track, Filters, SearchResult, Connectors and the configuration/type contracts exported from index.ts.

Advanced public exports currently include backend adapters, detection, node selection, failover, health, circuit breaker, storage/snapshot APIs, track codec/resolver, REST and WebSocket, voice receiver, live chat and native metadata providers. Existing exports are retained; API removals require documented deprecation and a compatible release plan.

Internal lifecycle mechanisms should remain behind public contracts: playback attempts and guards, player command scheduling, recovery admission, session synchronization and migration transaction logic.

## Dependency baseline

Runtime dependency: consola 3.4.2. Lockfile resolves TypeScript 5.9.3, @types/node 24.12.2 and discord.js 14.26.2 as development dependencies. Keep the current lockfile frozen; no new mandatory dependencies were introduced by this audit. Preserve OSL-3.0 and upstream attribution.

## Remaining exit criteria

1. Require green CI for the current stabilization baseline on supported Node versions; historical failed runs remain visible.
2. Verify the new mandatory strict build on both Node.js versions. Baseline diagnostics decreased from 88 to 44, 14 and 1 before strict enforcement. The final zero-error result must be confirmed by CI.
3. Audit ownership and protocol boundaries, event subscriptions and shutdown, backend-specific state, and storage concurrency.
4. Document public API compatibility and explicit feature constraints for both backends.
5. Distinguish local protocol fixtures from live Discord audio integration and verify real-node scenarios separately before claiming production readiness.

Phase 2 starts only after the stabilization baseline is accepted. No new backend features should be mixed into corrective commits without a specific reason.
