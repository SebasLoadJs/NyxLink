# API coverage inventory — 2026-11-26

Audit inputs: [NodeLink source 86c6a00](https://github.com/PerformanC/NodeLink/tree/86c6a00d022cbf1cafdbc5eea39a2b7033637485/src/api), [Lavalink v4 REST](https://lavalink.dev/api/rest), [official plugin catalog](https://lavalink.dev/plugins), [NodeLink REST](https://nodelink.js.org/docs/api/rest), [NodeLink community plugins](https://nodelink.js.org/docs/plugins). Source inventory is not evidence of real provider or audio availability.

## REST and WebSocket coverage

| Route family | NyxLink entry | Status |
| --- | --- | --- |
| version, info, stats | Rest.getVersion/getInfo/getStats | Existing |
| loadtracks, decodetrack, decodetracks | Rest.loadTracks/decodeTrack/decodeTracks | Existing |
| sessions and players | Rest.updateSession/getPlayers/getPlayer/updatePlayer/destroyPlayer | Existing |
| routeplanner/status and free operations | Rest.getRoutePlannerStatus/freeFailedAddress/freeAllFailedAddresses | Existing; revision-dependent |
| NodeLink connection, metrics, workers | Rest.getNodeLinkConnectionSnapshot/getNodeLinkMetrics/getNodeLinkWorkerSnapshots/terminateNodeLinkWorker | Typed contracts; legacy methods retained |
| NodeLink encode and stream | Rest.encodeTrackRemote/encodeTracksRemote/trackStream/getStreamFormats/loadStream | Existing; real seek acceptance pending |
| NodeLink lyrics, chapters, meaning | Rest.loadLyrics/loadChapters/loadMeaning/subscribeLyrics/unsubscribeLyrics | Existing |
| NodeLink groups, mix, SponsorBlock | Rest group, mix and SponsorBlock methods | Existing |
| NodeLink source health and YouTube config/OAuth | Rest.getSourceHealth/getYoutubeConfig/updateYoutubeConfig/exchangeYoutubeOAuth | Existing; review administrative contracts |
| NodeLink HLS relay | Rest.createHlsSession/getHlsPlaylist/getHlsInitSegment/getHlsSegment | Native HLS contracts implemented; real playback pending |
| NodeLink profiler HTTP/UI/file/socket | Rest.getNodeLinkProfilerStatus/runNodeLinkProfilerCommand | Typed read/status and six explicit POST actions; raw file/UI and remote inspector deliberately excluded |
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
| LavaLyrics | Typed getLavaLyrics/getCurrentLavaLyrics/subscribeLavaLyrics/unsubscribeLavaLyrics and lavaLyricsEvent | Real provider subscription tests |
| DuncteBot | Core sources | Exact source prefixes and runtime matrix |
| XM | Core encoded tracks | Actual module playback acceptance |
| Lyrics.kt | Typed getLyricsKt/getCurrentLyricsKt/searchLyricsKt | Pinned runtime and provider acceptance pending |
| Java Timed Lyrics | getJavaTimedLyrics/getCurrentJavaTimedLyrics/searchJavaTimedLyrics/searchJavaTimedLyricsGenius; LavaLyrics provider interoperability | Pinned runtime and live provider acceptance pending |
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

- [Lyrics.kt at d0dfbb1](https://github.com/DRSchlaubi/lyrics.kt/blob/d0dfbb1385f528a335460d16c2dd9023de70baf5/lavalink/src/main/kotlin/LyricsRestHandler.kt): three independent GET routes, advertised plugin name `lyrics`, timed/text union, nullable line ranges, search metadata and provider absence. Unlike LavaLyrics, the current-track route ends in `/lyrics`, not `/track/lyrics`. Client fixture tests are not proof of provider or runtime compatibility.

- Typed `Rest.getBackendInfo()` and `Rest.getNodeLinkTrackStreamInfo()` are additive to preserve existing consumers of raw `/info` and `/trackstream` responses. Stream URL resolution is metadata only; provider URLs may contain credentials and are not fetched by the SDK. `NodeLinkStreamFormat` and `NodeLinkStreamFormats` are exported from the package root.

- `Rest.getNodeLinkMetrics()` supports separately configured raw, Bearer and Basic credentials, strict same-origin transport, HTTPS (explicit literal-loopback HTTP opt-in), Prometheus response validation, cancellation, and optional capability observations without treating a scrape failure as a playback outage. The upstream router may log invalid credentials; configure server-side log redaction before real use.

- `Rest.runNodeLinkProfilerCommand()` exposes the explicit POST actions `forceGc`, `cpuStart`, `cpuStop`, `heapSamplingStart`, `heapSamplingStop` and `heapSnapshot` with explicit scope and confirmation, HTTPS or literal-loopback opt-in, no redirect or retry, header-only access code and a detached acknowledgement. These operations can affect latency, memory, storage and playback; never invoke them automatically. Server-side completion is not guaranteed after timeout or cancellation. Raw heap artifacts, inspector exposure, arbitrary file access and remote debug UI remain outside the SDK. Use a controlled administrative environment.

- Typed connection diagnostics model the native disabled sentinel without triggering failover and exclude network addresses, hostnames and free-form errors. Typed single/batch track encoders validate the upstream input shape, response encoding and batch cardinality; legacy encoder methods remain available.

## Expanded pinned runtime matrix

The independent `Lavalink expanded plugin matrix` workflow boots one plugin at a time using the existing immutable Lavalink image. GitHub release metadata published SHA-256 and byte lengths for YouTube Source 1.18.2, LavaSrc 4.8.3 and DuncteBot 1.7.2. The exact release assets are verified before installation; credentials are not configured. The acceptance checks exact advertised version, typed backend inventory and a generated local WAV load. These are startup and protocol checks, not provider playback claims. LavaSearch and Lyrics.kt release assets did not advertise SHA-256 digests; they remain unpinned until independent artifact verification. See the machine-readable `tests/integration/lavalink-plugin-matrix.json`.

## Regression inventory

Pinned public API baseline: `v5.3` at `79176cb26f171bb13f6501783651bd21101346a6`. The current reference retains all 284 declaration headings and all method names of seven core public classes (Rest, Node, Player, Manager, Filters, Track, Queue). This is a removal guard, not proof of signature or behavior equivalence; strict consumer fixtures and package tests are separate. The independent native route baseline checks 36 extension operations, including the optional proposed `loadmedia`, for method, path, transport and rejection on Lavalink. Core Lavalink routes are covered separately by protocol and backend integration tests. Raw profiler files, inspector endpoints and server UI are deliberate exclusions.

- Java Timed Lyrics [1.6.6 standalone REST source](https://github.com/DuncteBot/java-timed-lyrics/blob/1.6.6/src/main/java/me/duncte123/lyrics/lavalink/RestHandler.java) advertises `java-lyrics-plugin` and uses `/v4/lyrics/search?query=...&source=youtube|genius`, distinct from Lyrics.kt. YouTube results are a list of video IDs; Genius returns text lyrics and requires operator configuration. Four separate capability keys prevent cross-plugin routing. The `java-lavalyrics` provider module is not a standalone REST API.

The expanded matrix also pins XM 0.2.8 and Java Timed Lyrics 1.6.6 (standalone and separate LavaLyrics provider variant). XM uses an original generated MOD fixture, not copyrighted music. The standalone Java plugin tests the real current-track no-track route without provider credentials; the provider variant is installed together with pinned LavaLyrics 1.1.0 and never alongside the conflicting standalone plugin. The initial run passed Java standalone; XM failed acceptance and Java LavaLyrics failed startup. See [run 45936637301](https://github.com/SebasLoadJs/NyxLink/actions/runs/45936637301). The Java provider's compile-time LavaLyrics revision `7d60077` and release tag `1.1.0` resolve to the same source tree; binary compatibility and Spring wiring still require evidence. No upstream defect is inferred solely from these failures.

Evidence: [expanded three-profile matrix passed](https://github.com/SebasLoadJs/NyxLink/actions/runs/45934539206) at `573492ad61dfbf996cb16c168c20fe48bd3c85fd`; baseline LavaLyrics/SponsorBlock integration passed in [Validate NyxLink](https://github.com/SebasLoadJs/NyxLink/actions/runs/45934602917) at `28bc4deede427298cefc90bc01dbc1e41b6a693e`. New XM/Java profiles are not covered by that historical evidence.

## Artifact provenance discovery

The remaining four plugins are listed in `tests/integration/plugin-artifact-candidates.json`: exact release assets for LavaSearch 1.0.0, Lyrics.kt 2.6.1 and Google Cloud TTS 1.0.1, and the documented JitPack coordinate for LavaDSPX 0.0.5. A separate workflow observes SHA-256/size with bounded HTTPS transfers, and compares Maven mirrors where known. It never installs, extracts or executes candidates, and a hash observation alone is not authenticity proof or approval. Pin reviews and runtime profiles are separate steps; no candidate is automatically promoted.

[Artifact audit run 45940019041](https://github.com/SebasLoadJs/NyxLink/actions/runs/45940019041) observed identical bytes/SHA-256 for the GitHub and official Maven artifacts of LavaSearch 1.0.0 and Lyrics.kt 2.6.1. These two reviewed pins are admitted to the isolated lab; the comparison is not a cryptographic publisher signature. Google Cloud TTS and LavaDSPX remain single-source observations and are not executed yet. [Diagnostic matrix run 45939969449](https://github.com/SebasLoadJs/NyxLink/actions/runs/45939969449) refined the remaining failures to `PLUGIN_REQUIRED_BEAN_MISSING` (Java LavaLyrics) and `PLUGIN_XM_LOAD_EMPTY` (XM). No passing status is assigned to them.

Evidence at `2a0aab2`: [expanded matrix run 45940129286](https://github.com/SebasLoadJs/NyxLink/actions/runs/45940129286) passed the two mirror-matched additions LavaSearch and Lyrics.kt. XM and Java LavaLyrics still fail. XM now compares the same original MOD fixture over HTTP and a read-only mounted local file; local source is enabled only in that isolated test profile. Java startup diagnostics distinguish fixed known dependency classes, without raw logs. These diagnostic additions are not passing results.

The Java provider requires an `AbstractRoutePlanner` bean; upstream Lavalink 4.2.2 only creates it when the rate-limit block contains IP ranges. The isolated Java provider profile now uses a loopback-only range and does not test remote provider access. XM's previous result was empty for both local/HTTP; the MOD fixture was independently recognized by FFprobe/libopenmpt (7.68 seconds). The lab adds an original XM fixture and a direct REST observation to distinguish SDK behavior from the server. Results remain pending.

The final two catalog entries are now explicit experimental profiles. Google Cloud TTS 1.0.1 (upstream plugin-api 0.9.0, exact descriptor `Google Cloud TTS`) and LavaDSPX 0.0.5 (JitPack coordinate from upstream README, exact descriptor `lavadspx-plugin`) use SHA-256/size observed in run 45940019041. They are single-source pins, not publisher-signed or mirror-verified; reviewed admission is restricted to the disposable lab with no provider credentials or production access. TTS is installation/protocol only, no synthesis. DSPX additionally exercises the high-pass REST control; this does not establish audible filter output. The old artifacts may be incompatible with modern Lavalink. No provider acceptance or passing result is claimed until CI runs.
