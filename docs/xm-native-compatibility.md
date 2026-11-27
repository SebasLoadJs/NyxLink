# XM 0.2.8 — native compatibility incident

**Status: incompatible with the tested runtime; upstream investigation required.** No general claim about all JVM, architecture or Lavalink versions.

## Observed evidence

- NyxLink revision `432935b2920560aad684edd10e34046b8de64f58`, [matrix run 45948900581](https://github.com/SebasLoadJs/NyxLink/actions/runs/45948900581).
- Lavalink 4.2.2, exact image digest in `tests/integration/backend-servers.json`.
- Upstream [XM v0.2.8](https://github.com/esmBot/lava-xm-plugin/releases/tag/v0.2.8), exact SHA-256 `05999770b3f7aecdd9264daa164c5402875e9cfbf8ae66e30f74b4d4abe21af2`.
- Plugin advertises its version, backend connects, and original WAV fixture loads successfully.
- Three independent Linux containers each fail on their first direct tracker REST request: HTTP MOD, mounted local MOD, HTTP XM. JVM fatal-frame classification is LIBXMP, exit 139, OOM false. SDK follow-up deliberately not run because the server exited.
- No third-party music or provider credentials are involved.

## Reproduce in a disposable Linux lab

From the pinned NyxLink checkout, install the lockfile and build. Run these separately, never on production:

```sh
pnpm install --frozen-lockfile
pnpm run build
node scripts/test-lavalink-plugin-matrix.cjs xm-mod-http
node scripts/test-lavalink-plugin-matrix.cjs xm-mod-local
node scripts/test-lavalink-plugin-matrix.cjs xm-native
```

Reports are written under `.runtime/plugin-matrix/`. The lab uses generated original fixtures, verified JARs, a random temporary password and read-only plugin/config mounts. Raw JVM fatal logs are not published.

## Candidate cause, not yet proven

The [pinned probe](https://github.com/esmBot/lava-xm-plugin/blob/v0.2.8/src/main/java/net/esmbot/lavaxm/LavaXmContainerProbe.java) instantiates the native Player, sets sample-skip flags, calls loadModuleFromMemory, then obtains Module and FrameInfo without starting playback. The precise native call that crashes has not been identified. A source-level change must be validated against the Java binding and native library in the same isolated lab; no untested patch is presented as a fix. The upstream release endpoint still reported v0.2.8 on 2026-11-27.

## Operator guidance

Do not install this tested plugin build on a production audio node. Its probe is a server-side extension, so restricting explicit .xm/.mod requests in a client does not establish safety for all other media requests. Use nodes without the affected plugin while the issue is unresolved. The strict XM acceptance jobs remain failing until actual format recognition succeeds. A separate upstream issue or patched build is not submitted or distributed by this document.
