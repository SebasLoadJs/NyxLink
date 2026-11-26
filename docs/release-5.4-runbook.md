# NyxLink 5.4 release gates

Current source line: 5.4.0-dev.1 on dev. Historical 5.3 tags and npm channels remain unchanged. The 5.3 release workflow is preserved as historical context.

1. Audit the public API against v5.3.0 and keep additive changes compatible; incompatible changes require a major-version decision.
2. Verify the actual generated public API, strict types, Node 22/24 regression suites, packaging and production dependency audit.
3. Verify pinned baseline/modern NodeLink and Lavalink, plugin integration, Redis, CodeQL, Qodana and extended endurance. Include the exact upstream accepted revision or pinned experimental fork when checking new NodeLink functionality.
4. Real voice/listening, provider and AutoMix acceptance remain separate from protocol and fixture tests. Record untested credentials-dependent cases honestly.
5. Recheck the public npm registry for each exact version. Keep development packages on dev, release candidates on next, and stable on latest. The existing read-only publication workflow does not publish. Do not add publishing credentials to source or logs.
6. Once accepted, freeze the candidate on a supported release branch, use a new immutable v5.4.0-rc.N annotated tag matching package.json, and publish to next through authorized npm access. Verify the installed registry package and preserve the previous latest.
7. Once stable gates pass, use a fresh 5.4.0 commit, immutable v5.4.0 tag, matching GitHub release and npm latest. Never move existing release tags or republish a used npm version.

See [upstream scope audit](nodelink-5.4-upstream-audit.md). No publication is performed by this document.

## Clean distribution artifact

After the full development gates pass on the exact candidate, use `pnpm run pack:release`. The output under `.runtime/distribution/` is the only intended npm publication artifact; it contains the SDK, public Aurora entry points, README assets and required license/notice, without development scripts or devDependency metadata. `test:package` installs this same staging format in an isolated consumer. Do not publish directly from the development checkout. Publication remains an authorized external step; historical registry versions are immutable.
