# NyxLink 5.4 release gates

Current source line: 5.4.0-dev.1 on dev. Historical 5.3 tags and npm channels remain unchanged. Release workflows now accept future numeric stable and RC tags, reject development tags, and validate the exact SemVer with release-policy.cjs.

1. Audit the public API against v5.3.0 and keep additive changes compatible; incompatible changes require a major-version decision.
2. Verify the actual generated public API, strict types, Node 22/24 regression suites, packaging and production dependency audit.
3. Verify pinned baseline/modern NodeLink and Lavalink, plugin integration, Redis, CodeQL, Qodana and extended endurance. Include the exact upstream accepted revision or pinned experimental fork when checking new NodeLink functionality.
4. Real voice/listening, provider and AutoMix acceptance remain separate from protocol and fixture tests. Record untested credentials-dependent cases honestly.
5. Recheck the public npm registry for each exact version. Keep development packages on dev, release candidates on next, and stable on latest. The existing read-only publication workflow does not publish. Do not add publishing credentials to source or logs.
6. Once accepted, freeze the fully tested development revision (with QA tooling present), use a new immutable v5.4.0-rc.N annotated tag matching package.json, and publish to next through authorized npm access. Verify the installed registry package and preserve the previous latest.
7. Once stable gates pass, use a fresh 5.4.0 commit, immutable v5.4.0 tag, matching GitHub release and npm latest. Never move existing release tags or republish a used npm version.

See [upstream scope audit](nodelink-5.4-upstream-audit.md). No publication is performed by this document.

## Clean distribution artifact

After the full development gates pass on the exact candidate, use `pnpm run pack:release`. The local output under `.runtime/distribution/` is a preparation artifact, not release evidence; it contains the SDK, public Aurora entry points, README assets and required license/notice, without development scripts or devDependency metadata. `test:package` installs the staging format in an isolated consumer and retains the exact archive after successful validation. Do not publish directly from the development checkout. Publication remains an authorized external step; historical registry versions are immutable.

### Source, tag and clean branch are different surfaces

The immutable release tag must point at the fully validated development revision, with the build and QA scripts available to its tag-triggered workflows. The clean maintenance branch can then be derived from that revision without the development lab. Never tag a stripped maintenance checkout in place of the tested source. Preserve the exact source revision and tag in the release notes. The tagged source remains available to satisfy OSL source obligations.

Download the successful workflow's `validated-release-distribution` artifact (or `validated-manual-distribution` for an approved development build), inspect `integrity.json`, verify `sha256sum -c SHA256SUMS`, then publish that exact `.tgz` through authorized npm access. Do not repack after testing. A successful artifact is not by itself approval to publish: all other acceptance gates must still pass. The Node 22/24 PR artifacts are development evidence, not automatic publication.

## Current release-blocker ledger (2026-11-27)

- At `da1d22e1776c87a05d10646d719f4afd708dc87e`, [Node 22/24 validation](https://github.com/SebasLoadJs/NyxLink/actions/runs/46083133731), [protocol integration](https://github.com/SebasLoadJs/NyxLink/actions/runs/46083133684), [local endurance](https://github.com/SebasLoadJs/NyxLink/actions/runs/46083133697), [extended endurance](https://github.com/SebasLoadJs/NyxLink/actions/runs/46083133873), [Redis](https://github.com/SebasLoadJs/NyxLink/actions/runs/46083133721) and [CodeQL](https://github.com/SebasLoadJs/NyxLink/actions/runs/46083133703) passed. The latest separately observed proposal workflow was green at `432935b`; this is not evidence for a newer revision.
- [Expanded matrix](https://github.com/SebasLoadJs/NyxLink/actions/runs/46083133688) passed nine profiles and failed the three independent XM profiles. Ten of eleven official catalog entries have baseline/expanded protocol acceptance, not provider playback certification. XM is an external native incompatibility documented in [the incident](xm-native-compatibility.md). Do not call the full matrix green. If the owner accepts a release scope excluding that exact incompatible combination, state it explicitly in release notes and preserve the failing compatibility evidence; no such decision is assumed here.
- Current changes to shared extension ownership/session fencing and adapter capability isolation require fresh validation. No RC, stable tag, npm publication or clean release branch is created by this ledger. The continuous 24–72 h soak and real Discord voice checks remain unverified; see [external acceptance](pending-real-world-acceptance.md).
