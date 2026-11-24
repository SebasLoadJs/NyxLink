# Final convergence — integration branch, not a release

Inputs: dev 67bcaee6b95a055cc3a160981ad2e85c0de8705e; #32 c9e042d632542d8aac4b5cae25da6669e4842917; common ancestor 03546fd49faffdaaf9e0ad45e1e9c7439ec749a6.

This branch initially applies 83 disjoint file changes from #32 to the integrated Aurora/release base. It intentionally leaves both-modified files at dev until reconciled. Neither source branch is deleted or changed. CI cannot establish completion while these overlaps are outstanding. Do not merge this integration branch until the remaining files have been reconciled, the public generated API regenerated, and all checks pass on its exact SHA.

## Overlapping files — initial reconciliation recorded

- [x] `.github/workflows/pr.yml` — initial reconciliation; CI pending
- [x] `CHANGELOG.md` — initial reconciliation; CI pending
- [x] `README.md` — initial reconciliation; CI pending
- [x] `docs/live-voice-verification.md` — initial reconciliation; CI pending
- [x] `docs/master-plan-reconciliation.md` — initial reconciliation; CI pending
- [x] `index.ts` — initial reconciliation; compile and contract checks pending
- [x] `package.json` — initial reconciliation; CI pending
- [x] `scripts/check-package.cjs` — initial reconciliation; CI pending
- [x] `scripts/endurance-worker.cjs` — initial reconciliation; CI pending
- [x] `scripts/test-package.cjs` — initial reconciliation; CI pending
- [x] `src/core/Manager.ts` — initial reconciliation; compile and contract checks pending
- [x] `src/entities/Node.ts` — initial reconciliation; CI pending
- [x] `src/entities/Player.ts` — initial reconciliation; CI pending
- [x] `src/entities/Rest.ts` — initial reconciliation; CI pending
- [x] `src/logging/LogFormatter.ts` — initial reconciliation; CI pending
- [x] `src/logging/Logger.ts` — initial reconciliation; CI pending
- [x] `src/logging/index.ts` — initial reconciliation; compile and contract checks pending
- [x] `src/players/PlayerMigration.ts` — initial reconciliation; CI pending
- [x] `src/tracks/TrackResolver.ts` — initial reconciliation; CI pending
- [x] `src/typings/Interfaces.ts` — initial reconciliation; compile and contract checks pending
- [x] `tests/helpers/backend-lab.cjs` — initial reconciliation; CI pending
- [x] `tests/logger.test.cjs` — initial reconciliation; CI pending

## Acceptance

Retain Aurora V4 and #32 playback, resolver, selection, mixer, extension, performance and documentation work. Keep a single effective event route per configured mode. Verify Node 22/24, package consumers, CodeQL, Qodana, Redis, Lavalink and both NodeLink profiles, plugins, seek contribution, extended 600s endurance, and private live acceptance; no publication implied.

Manager preserves Aurora/legacy mutual exclusion, OTel, performance monitoring and extension shutdown. Both structured record shapes are exported: the #32 record retains its name, while the ConsoleReporter record is provisionally LegacyStructuredLogRecord. Review backwards compatibility of this naming before acceptance.

REST now uses the #32 overload-preserving proxy for monitor/legacy tracing and one optional Aurora OTel operation per underlying request. Track resolution keeps abort/metadata/session fences and a separate operation span. Migration retains actual failure codes and cancellation guard. Verify classifications and test regressions before merging.

Legacy sink compatibility is retained as a sanitized synchronous adapter alongside the #32 bounded structured pipeline; custom transport and legacy sink configuration are mutually exclusive. Both branches' credential redaction and logger regressions are included. Confirm CodeQL and packed consumer compatibility.

All 22 overlapping files now have an initial reconciliation. The combined branch is not accepted until its build, generated API, tests and CI pass. The original #32 branch remains intact. Do not claim independent review of every conflict resolution until the combined suite is green.

## Aurora V4 precedence (owner clarification)

Aurora V4 supersedes the earlier logging implementation. One canonical Pino engine and mutually exclusive destinations are the required final architecture; Consola is presentation only. Do not merge until legacy Logger calls are migrated to the canonical route; the current Manager still exposes the old compatibility path, so convergence is not complete. The host pipeline now routes Custom through Pino as well, assigns Consola semantic levels to canonical events and styles incident panels using Chalk, Boxen, Log Symbols and Pretty MS, with bounded width and static fallbacks. Tests cover known evidence, private fields, state variants and widths. Remaining dependency-specific acceptance (including real MultiBar and Listr2 visual phases, richer Inspector and live-region styling) must be demonstrated, not inferred from installed packages. No release or CI success is claimed.

## Aurora V5 visual expansion (owner-approved direction)

Aurora replaces the previous logger, not a parallel logging product.
This increment adds nine exact-pinned optional consumer dependencies:
cli-truncate (width-safe labels), wrap-ansi (styled record wrapping),
slice-ansi (search viewport), is-unicode-supported (glyph capability),
figures (state symbols), @crafter/charts (actual latency/readiness),
ink-text-input (search), ink-select-input (tab picker), and ink-spinner
(report write pending state). The Inspector also formats observed memory
through pretty-bytes. Missing values remain N/A. The root dependency
manifest and lockfile are unchanged; isolated packed-consumer tests
install these pins. CI must verify compatibility and actual behavior.

The @crafter/cli-tree package is a command-discovery tool, not a runtime
trace-tree renderer; keep the existing bounded span traversal. Do not
add TSLog, Winston or another competing logger. Remaining proposed
dependencies (supports-color, ansi-escapes, pino-abstract-transport,
sonic-boom, terminal-link, humanize-duration, tinybench, node-pty and
optional OTel instrumentation/exporters) require a specific tested use
and must not duplicate existing facilities. The previous Logger migration
and combined CI remain release blockers; these changes are not a release.
