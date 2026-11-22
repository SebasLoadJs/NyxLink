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

## 4.2 SponsorBlock categories (separate Lavalink contract)

Official upstream specification: https://github.com/topi314/SponsorBlock-Plugin#usage

Lavalink's optional SponsorBlock plugin exposes `GET`, `PUT`, and `DELETE /v4/sessions/{sessionId}/players/{guildId}/sponsorblock/categories`, where PUT accepts an array of the documented categories. In contrast, **NodeLink exposes `GET/PATCH/POST/DELETE .../sponsorblock` with its own state object and segment overrides**. These are not wire-compatible and no automatic mapping of the two is attempted.

```ts
// Only on a Lavalink v4 node advertising the SponsorBlock plugin:
const categories = await node.getLavalinkSponsorBlockCategories(guildId);
await node.setLavalinkSponsorBlockCategories(guildId, ['sponsor', 'selfpromo']);
await node.clearLavalinkSponsorBlockCategories(guildId);
```

The public category union covers `sponsor`, `selfpromo`, `interaction`, `intro`, `outro`, `preview`, `music_offtopic`, and `filler`. Requests reject unknown/duplicate categories and malformed session/guild identifiers before transport. A missing plugin or explicitly unavailable endpoint fails closed with `FeatureUnavailableError`. GET responses are validated before support is marked observed; PUT and DELETE are explicit user actions, not automatic skips. Backend and session fencing prevent stale observations from a prior connection.

The `tests/lavalink-sponsorblock.test.cjs` fixture covers the actual GET/PUT/DELETE HTTP methods, JSON array payloads, plugin gating, category validation, invalid paths, missing players, feature unavailability, and backend replacement during an in-flight request. A separate real plugin server, live segments and WebSocket `SegmentsLoaded`/`SegmentSkipped` events are **not** yet certified.

Future work: pin an optional SponsorBlock-enabled Lavalink server; verify live audio segments and chapter events with controlled tracks. Do not equate an HTTP 204 with successful audible skipping.

## 4.3 Real installed-plugin acceptance laboratory (CI verified, 2026-11-22)

The isolated `pnpm run test:lavalink-plugins` profile starts the same **digest-pinned Lavalink 4.2.2 image** used by the core protocol suite, but installs only these exact official Maven coordinates:

- `com.github.topi314.lavalyrics:lavalyrics-plugin:1.1.0` ([upstream release](https://github.com/topi314/LavaLyrics/releases/tag/1.1.0))
- `com.github.topi314.sponsorblock:sponsorblock-plugin:3.0.1` ([upstream release](https://github.com/topi314/SponsorBlock-Plugin/releases/tag/3.0.1))

The dependencies are fetched from `https://maven.lavalink.dev/releases` into a temporary, container-only writable plugin folder. The application config and password are generated for each run and removed in the cleanup path. No jar or external Java plugin source is vendored into the NyxLink repository. The script records observed downloaded JAR SHA-256 hashes in the local report for later supply-chain review, but hashes are **not yet separately approved pins**.

The test starts a local HTTP WAV source, requires both plugins to appear in actual `/v4/info`, checks NyxLink's backend identity, and tests the LavaLyrics no-provider HTTP request. **LavaLyrics 1.1.0 throws when no lyric manager is registered**; this is an explicit server-side HTTP 500 limitation and should not be mistaken for a lyric-not-found 204. The lab records the actual outcome and verifies that NyxLink does not mark an unsupported inference as confirmed. It also creates a paused, non-playing remote player for a SponsorBlock category GET(404)→PUT→GET(categories)→DELETE→GET(404) round-trip. **SponsorBlock 3.0.1 returns 404 for an absent guild category record**, rather than an empty list; that behavior is verified against [its released implementation](https://github.com/topi314/SponsorBlock-Plugin/blob/3.0.1/src/main/java/com/github/topi314/sponsorblock/plugin/SponsorBlockPlugin.java). Java module loading, endpoint routing and authenticated REST communication are tested against a real Lavalink server, **not fixture response mocks**.

Run only on an authorized Linux machine with Docker or Podman:

```bash
pnpm install --frozen-lockfile
NYXLINK_CONTAINER_ENGINE=docker pnpm run test:lavalink-plugins
```

The independent CI job `lavalink-plugins` is part of `.github/workflows/backend-integration.yml`. Its evidence file is `.runtime/lavalink-plugins/latest-report.json`. A successful run confirms real plugin startup and the tested no-provider/category behavior, not lyrics from Spotify/Deezer, synchronization of live lyric events, a playable SponsorBlock segment, audible music, or Discord voice.

The [real plugin GitHub Actions job](https://github.com/SebasLoadJs/NyxLink/actions/runs/45046994794) completed successfully on PR #20 with **four real-server checks**: both plugins advertised, HTTP WAV loading, LavaLyrics no-manager response, and SponsorBlock absent-state/PUT/GET/DELETE transitions. This is real **installed-plugin REST** evidence, not certification of lyric retrieval, segment skipping or audio quality. Pinning the plugin JAR checksums separately and testing controlled eligible playback remain release gates.

Source-level distinction: [`LyricsManager.loadLyrics`](https://github.com/topi314/LavaLyrics/blob/1.1.0/main/src/main/java/com/github/topi314/lavalyrics/LyricsManager.java) throws `IllegalStateException("No lyrics managers registered")` when its list of managers is empty, before provider lookup; [`LavaLyricsPlugin.loadLyrics`](https://github.com/topi314/LavaLyrics/blob/1.1.0/plugin/src/main/java/com/github/topi314/lavalyrics/plugin/LavaLyricsPlugin.kt) returns 204 only if `LyricsManager.loadLyrics` returns null. A successful no-provider lab check therefore **does not** certify retrieval or fallback of any lyric content.
