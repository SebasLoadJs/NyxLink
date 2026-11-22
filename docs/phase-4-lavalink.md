# Phase 4 — Lavalink optional plugin integration

## 4.1 LavaLyrics (client contract; fixture verified)

Official upstream contract: https://github.com/topi314/LavaLyrics#api (GET `/v4/lyrics?track=...&skipTrackSource=...`, HTTP 200 lyrics or 204 no content). This route is specific to a Lavalink v4 server with the optional LavaLyrics plugin and **must not be confused with** NodeLink's `GET /v4/loadlyrics?encodedTrack=...` endpoint.

### Public API

```ts
import type { LavaLyricsData } from 'nyxlink';

// On a Lavalink node whose /v4/info advertises lavalyrics(-plugin):
const data: LavaLyricsData | null =
  await node.getLavaLyrics(track, { skipTrackSource: false });

// Also available on the node's transport:
const same = await node.rest.getLavaLyrics(track.encoded);
```

This does not alter the NodeLink-only `node.loadLyrics(track, { lang, source, type })` API. Only a Lavalink backend with an explicitly advertised `lavalyrics` or `lavalyrics-plugin` entry may call the new endpoint. Other plugins, the wrong backend, and a previously observed unavailable endpoint are rejected before any network request. Presence in `/v4/info` is a **necessary admission condition, not proof that a lyrics provider is configured**.

Responses are validated against the documented source/provider/text/lines/plugin structure; invalid 200 bodies raise `ProtocolResponseError`. A response with no body (204) returns `null`. Explicit unavailable responses update the feature observation for the same active backend/session only; authentication or transient failures do not remove the plugin from inventory.

The HTTP request is bounded and sends the existing node's authorization header to the configured node; query construction uses `URLSearchParams`. No arbitrary third-party plugin route or credential-bearing management endpoint has been added.

### Acceptance evidence

The `tests/lavalyrics-plugin.test.cjs` suite includes isolated local HTTP fixtures for a populated response, empty response, incompatible backend, schema errors, authorization failure, disabled endpoint, route encoding and in-flight backend replacement. The TypeScript consumer test demonstrates the separate public contract.

**Not verified by these tests:** provider availability, real lyric sources, live lyric events/subscriptions, OAuth, Java plugin installation, real Lavalink-plugin deployment or Discord playback. The pinned standard Lavalink image does not automatically acquire optional plugins.

### Planned next milestones

1. Pin a separate optional-plugin Lavalink image or a reproducible fixture server configuration with explicit plugin versions/licenses; keep the baseline v4.2.2 image intact.
2. Run real LavaLyrics enabled, disabled, missing-provider and source-search scenarios.
3. Add separately reviewed, typed support for official LavaLyrics live subscriptions if demanded by OBEY's web player. Do not reuse NodeLink event semantics unverified.
4. Audit LavaSrc, YouTube Source and SponsorBlock plugin names and REST contracts independently; presence alone must not imply playable content.
5. Keep release gated on real Discord voice, concurrent sessions, crossfade audio and interruption/failover testing.

## Security and compatibility

No plugin artifacts or Java dependencies are vendored. The OSL-3.0 license stays unchanged. No changes to NodeLink client route mappings, stable `v5.2`, npm publication or transport credentials are needed for this contract increment.
