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

## Single-route migration checkpoint

Preferred Manager configuration is `options.logging: { target, level }`; `options.aurora` is a deprecated alias. Both cannot coexist. A shared weak ownership registry rejects manual attachment of a second automatic logging route, including a silent canonical route. `detachLogger()` closes the canonical subscription too. The optional host pipeline uses one common Pino engine constructor and canonical serialization for JSON, Pretty, Aurora and Custom; Silent constructs no engine. The legacy Logger options remain temporarily functional for backwards compatibility; full migration of those standalone methods and transports remains open, not an accepted second architecture. No CI acceptance or release is implied.

## Canonical Manager event migration

Deprecated Logger.attachManager now delegates to AuroraEvents instead of maintaining its own subscriptions or automatically consuming arbitrary debug strings. The registered canonical route also observes search and REST for either configuration shape. The legacy transport API receives a sanitized projection (some historical event names remain for compatibility). Explicit standalone Logger methods/formatters and direct manually assigned logger fixtures are retained; they are not a second automatic Manager event engine. Raw debug remains available to explicit host listeners, not automatic logging. Compatibility output is not the Pino visual pipeline; recommended logging.target uses that pipeline. Tests cover route exclusivity, detach, no raw data and one search event. Acceptance remains pending.

## Replacement decision — latest owner instruction supersedes historical compatibility checkpoints

The Manager legacy logging options and `options.aurora` alias have been removed. Former `Logger.attachManager` was deleted. Search, REST, migration stages, extension failures and private logging metrics use the single canonical Aurora route. Native Pino serialization is shared and lazily loaded. Aurora public subpaths and optional peers are shipped in the package rather than requiring copied examples. Standalone old Logger utilities remain as explicit public API at this checkpoint; they still require final removal or migration to the canonical schema before claiming full replacement. Frozen lockfile, generated API, packed consumer and complete CI remain mandatory. The separate read-only convergence generator creates lockfile/reference artifacts but does not certify acceptance or publish.

## Packed-consumer ESM correction

The packed consumer failed to import `nyxlink/aurora/inspector` under native Node because `@crafter/charts@0.2.5` ships extensionless ESM imports. Remove this incompatible peer and its lock entries; keep bounded, deterministic Unicode latency and readiness charts directly in Aurora with ASCII output, unknown-value handling and explicit consumer assertions. Other visual dependencies remain in use. The packed consumer and full CI gates remain required; this is not a release.

## Inspector input acceptance

After the ESM peer correction, packed Node 22/24 advanced through 11 checks; the remaining observed failure is interactive Inspector search. Expose editing/jump state, explicitly focus the text field, close detail on mode entry, and synchronize the packed consumer with rendered input states before sending further keys. The fixture also requires a non-matching event to disappear. Do not mark the package accepted until CI confirms the actual interaction.

## Approved Inspector enhancement

Packed consumer reached the search assertion, then failed when a rapid navigation key was consumed by the previously focused input. Guard callbacks and navigation with a synchronous mode reference. Keep exact search first, add optional Fuse.js 7.5.0 for typo-tolerant matching, and verify actual filtered results in packed tests. No new log engine or transport adapter. Full CI remains required.

## Advanced Aurora integrations (candidate)

Explicit terminal hyperlink capability checks and Ink documentation link, native Pino exclusive file destination using pino-abstract-transport and Pino's Sonic Boom, opt-in canonical OTLP log export, and Tinybench measurement have been implemented as a candidate. Lock entries use exact resolved versions. Packed tests and CI must certify them; no release is implied. Cross-platform Node PTY and retirement of standalone historical Logger API remain open.
