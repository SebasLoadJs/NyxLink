# Final convergence — integration branch, not a release

Inputs: dev 67bcaee6b95a055cc3a160981ad2e85c0de8705e; #32 c9e042d632542d8aac4b5cae25da6669e4842917; common ancestor 03546fd49faffdaaf9e0ad45e1e9c7439ec749a6.

This branch initially applies 83 disjoint file changes from #32 to the integrated Aurora/release base. It intentionally leaves both-modified files at dev until reconciled. Neither source branch is deleted or changed. CI cannot establish completion while these overlaps are outstanding. Do not merge this integration branch until the remaining files have been reconciled, the public generated API regenerated, and all checks pass on its exact SHA.

## Overlapping files awaiting reconciliation

- [ ] `.github/workflows/pr.yml`
- [ ] `CHANGELOG.md`
- [ ] `README.md`
- [ ] `docs/live-voice-verification.md`
- [ ] `docs/master-plan-reconciliation.md`
- [ ] `index.ts`
- [ ] `package.json`
- [ ] `scripts/check-package.cjs`
- [ ] `scripts/endurance-worker.cjs`
- [ ] `scripts/test-package.cjs`
- [ ] `src/core/Manager.ts`
- [ ] `src/entities/Node.ts`
- [ ] `src/entities/Player.ts`
- [ ] `src/entities/Rest.ts`
- [ ] `src/logging/LogFormatter.ts`
- [ ] `src/logging/Logger.ts`
- [ ] `src/logging/index.ts`
- [ ] `src/players/PlayerMigration.ts`
- [ ] `src/tracks/TrackResolver.ts`
- [ ] `src/typings/Interfaces.ts`
- [ ] `tests/helpers/backend-lab.cjs`
- [ ] `tests/logger.test.cjs`

## Acceptance

Retain Aurora V4 and #32 playback, resolver, selection, mixer, extension, performance and documentation work. Keep a single effective event route per configured mode. Verify Node 22/24, package consumers, CodeQL, Qodana, Redis, Lavalink and both NodeLink profiles, plugins, seek contribution, extended 600s endurance, and private live acceptance; no publication implied.
