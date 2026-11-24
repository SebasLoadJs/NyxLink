# Final convergence — integration branch, not a release

Inputs: dev 67bcaee6b95a055cc3a160981ad2e85c0de8705e; #32 c9e042d632542d8aac4b5cae25da6669e4842917; common ancestor 03546fd49faffdaaf9e0ad45e1e9c7439ec749a6.

This branch initially applies 83 disjoint file changes from #32 to the integrated Aurora/release base. It intentionally leaves both-modified files at dev until reconciled. Neither source branch is deleted or changed. CI cannot establish completion while these overlaps are outstanding. Do not merge this integration branch until the remaining files have been reconciled, the public generated API regenerated, and all checks pass on its exact SHA.

## Overlapping files awaiting reconciliation

- [x] `.github/workflows/pr.yml` — initial reconciliation; CI pending
- [ ] `CHANGELOG.md`
- [ ] `README.md`
- [ ] `docs/live-voice-verification.md`
- [ ] `docs/master-plan-reconciliation.md`
- [x] `index.ts` — initial reconciliation; compile and contract checks pending
- [x] `package.json` — initial reconciliation; CI pending
- [x] `scripts/check-package.cjs` — initial reconciliation; CI pending
- [x] `scripts/endurance-worker.cjs` — initial reconciliation; CI pending
- [ ] `scripts/test-package.cjs`
- [x] `src/core/Manager.ts` — initial reconciliation; compile and contract checks pending
- [ ] `src/entities/Node.ts`
- [ ] `src/entities/Player.ts`
- [ ] `src/entities/Rest.ts`
- [ ] `src/logging/LogFormatter.ts`
- [ ] `src/logging/Logger.ts`
- [x] `src/logging/index.ts` — initial reconciliation; compile and contract checks pending
- [ ] `src/players/PlayerMigration.ts`
- [ ] `src/tracks/TrackResolver.ts`
- [x] `src/typings/Interfaces.ts` — initial reconciliation; compile and contract checks pending
- [ ] `tests/helpers/backend-lab.cjs`
- [ ] `tests/logger.test.cjs`

## Acceptance

Retain Aurora V4 and #32 playback, resolver, selection, mixer, extension, performance and documentation work. Keep a single effective event route per configured mode. Verify Node 22/24, package consumers, CodeQL, Qodana, Redis, Lavalink and both NodeLink profiles, plugins, seek contribution, extended 600s endurance, and private live acceptance; no publication implied.

Manager preserves Aurora/legacy mutual exclusion, OTel, performance monitoring and extension shutdown. Both structured record shapes are exported: the #32 record retains its name, while the ConsoleReporter record is provisionally LegacyStructuredLogRecord. Review backwards compatibility of this naming before acceptance.
