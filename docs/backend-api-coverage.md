# API coverage inventory — 2026-11-26

Audit inputs: [NodeLink source 86c6a00](https://github.com/PerformanC/NodeLink/tree/86c6a00d022cbf1cafdbc5eea39a2b7033637485/src/api), [Lavalink v4 REST](https://lavalink.dev/api/rest), [official plugin catalog](https://lavalink.dev/plugins), [NodeLink REST](https://nodelink.js.org/docs/api/rest), [NodeLink community plugins](https://nodelink.js.org/docs/plugins). Source inventory is not evidence of real provider or audio availability.

## REST and WebSocket coverage

| Route family | NyxLink entry | Status |
| --- | --- | --- |
| version, info, stats | Rest.getVersion/getInfo/getStats | Existing |
| loadtracks, decodetrack, decodetracks | Rest.loadTracks/decodeTrack/decodeTracks | Existing |
| sessions and players | Rest.updateSession/getPlayers/getPlayer/updatePlayer/destroyPlayer | Existing |
| routeplanner/status and free operations | Rest.getRoutePlannerStatus/freeFailedAddress/freeAllFailedAddresses | Existing; revision-dependent |
| NodeLink connection, metrics, workers | Rest.getConnectionStatus/getMetrics/getWorkers/patchWorker | Existing; several broad response types |
| NodeLink encode and stream | Rest.encodeTrackRemote/encodeTracksRemote/trackStream/getStreamFormats/loadStream | Existing; real seek acceptance pending |
| NodeLink lyrics, chapters, meaning | Rest.loadLyrics/loadChapters/loadMeaning/subscribeLyrics/unsubscribeLyrics | Existing |
| NodeLink groups, mix, SponsorBlock | Rest group, mix and SponsorBlock methods | Existing |
| NodeLink source health and YouTube config/OAuth | Rest.getSourceHealth/getYoutubeConfig/updateYoutubeConfig/exchangeYoutubeOAuth | Existing; review administrative contracts |
| NodeLink HLS relay | Rest.createHlsSession/getHlsPlaylist/getHlsInitSegment/getHlsSegment | Native HLS contracts implemented; real playback pending |
| NodeLink profiler HTTP/UI/file/socket | profiler modules | Not implemented as a typed SDK client; privileged operational interface, separate security review |
| NodeLink rich media/lyrics/analysis/visualization/protected audio/AutoMix | Optional 5.4 contracts | Six open upstream proposals; fixture interoperability only |
| WebSocket playback and plugin events | Node events, nodeRaw, VoiceReceiver | Core exists; audit plugin-specific event schemas |

## Lavalink plugin catalog

| Plugin in official directory | Current client surface | Remaining work |
| --- | --- | --- |
| YouTube source | Core load/search plus four explicit YouTube plugin REST operations | Pinned plugin runtime and live provider tests |
| Google Cloud TTS | Source-based loading when advertised | Pinned runtime and credential-dependent tests |
| SponsorBlock | Native category methods and normalized events | Live skip and chapter acceptance |
| LavaSrc | Collection and track metadata views, core sources | Pin provider-specific metadata and live access |
| LavaSearch | Typed loadSearch | Pinned integration and provider acceptance |
| LavaLyrics | Typed getLavaLyrics/getCurrentLavaLyrics/subscribeLavaLyrics/unsubscribeLavaLyrics | Event schema and real plugin/provider subscription tests |
| DuncteBot | Core sources | Exact source prefixes and runtime matrix |
| XM | Core encoded tracks | Actual module playback acceptance |
| Lyrics.kt | Generic source/plugin surface | Inspect plugin-specific routes and response schemas |
| Java Timed Lyrics | LavaLyrics provider interoperability where configured | Pin plugin/provider and test |
| LavaDSPX | Typed setLavaDSPX and plugin filter recovery projection | Audible effects and pinned integration |

## NodeLink plugin catalog

Cloudflare Tunnel changes server deployment rather than playback protocol. The sample plugin demonstrates custom routes, sources and filters. Client route registration now supports explicitly advertised custom plugins on both backends; see [custom backend plugins](custom-backend-plugins.md). Arbitrary unknown plugins cannot be certified without their exact contract. Maintain explicit typed integrations for public well-known APIs; use registered custom routes rather than modifying the SDK core.

## Additional upstream source review

- [LavaLyrics at 725185e](https://github.com/topi314/LavaLyrics/blob/725185e086a2bb26144c7df1c85a4f1fb82f41a0/plugin/src/main/java/com/github/topi314/lavalyrics/plugin/LavaLyricsPlugin.kt): current track GET and subscribe POST/DELETE now have separate client operations, explicit 204 semantics, guild fencing and independent capability observations. Fixture tests do not establish real lyrics delivery.
- [YouTube plugin at e41dd95](https://github.com/lavalink-devs/youtube-source/blob/e41dd95f8bd134b51e75080fb28cc805fecb431a/plugin/src/main/java/dev/lavalink/youtube/plugin/YoutubeRestHandler.java): distinct unversioned `/youtube`, `/youtube/stream/{videoId}`, `/youtube/oauth/{refreshToken}` and POST `/youtube` routes. These must not be sent to NodeLink's `/v4/youtube/*` endpoints. All four client operations implemented with independent capability keys. Administrative calls require explicit sensitive access and HTTPS (opt-in literal loopback HTTP for tests). Upstream logs may still contain secrets. Real provider/stream acceptance is not established.

## Priorities

1. Verify the exact upstream route methods, input/output and optional endpoint behavior, especially NodeLink administrative and diagnostic APIs.
2. Complete event schema and plugin version matrix; compare against stable public exports.
3. Add pinned plugin runtime tests separately from simulated payload tests. Preserve no-credentials cases as untested, not passed.
4. Keep privileged profiler/relay operations out of normal player control until the authorization and transport contract is reviewed.
5. No claim of complete API parity or release acceptance until the remaining contracts and real backend evidence are recorded.
