# NyxLink API guide

This guide describes the development API implemented in the source tree. The generated `dist/index.d.ts` and its re-exported declarations are the exact signature reference after `pnpm run build`. Examples are compiled from the installed tarball by `pnpm run test:package`; a historical green CI run does not certify this working tree.

The [generated public API reference](api-generated.md) lists every root export and its public/protected declaration signatures. `pnpm run docs:api` regenerates it; CI checks that it matches the built declarations.

## Manager and Discord integration

`new Manager({ nodes, send?, options? })` creates a client without logging output, HTTP metrics listeners or Discord login. Configure a connector through `manager.use(...)` or an application-owned gateway sender. `init(clientId)` is asynchronous, requires a Discord snowflake string and initializes storage/nodes; `packetUpdate(packet)` accepts the supported Discord gateway voice packets. The SDK does not contain a bot command router, music website or Discord voice encoder.

| Member | Behavior |
| --- | --- |
| `manager.nodes` | NodeManager: configured nodes, selection, inventories, drain/eject |
| `manager.players` | PlayerManager: create/get/restore/destroy players |
| `manager.search(query)` | Validated SearchResult with deadline, AbortSignal, optional resolver/cache/fallback |
| `manager.decodeTrack(encoded)` / `encodeTrack(info)` | Client track codec; does not extract or stream source audio |
| `manager.useGuildLeases(options)` | Explicit Redis guild ownership before any players are created |
| `manager.startPrivateMetricsServer(options)` | Starts a private loopback service only when called |
| `manager.useExtension(extension, options?)` | Optional typed event extension lifecycle; returns an async disposer |
| `manager.removeExtension(name)` | Removes/aborts a registered extension |
| `manager.detachLogger()` | Detaches manager logging observers; does not close an independently owned Logger |
| `manager.shutdown()` | Terminal idempotent cleanup; attempts all resources and aggregates failures |

`manager.on(event, listener)` returns an unsubscribe function. `IManagerEvents` is the event signature inventory: node connection/readiness/errors, track/queue activity, player lifecycle and commands, source health, recovery/failover, guild ownership and extension errors. Raw payload events are a compatibility boundary, not automatic privacy-safe telemetry; avoid persisting them indiscriminately.

## Players and music

`manager.players.create(config)` creates a local Player on an eligible node. `restore(config)` restores according to the persisted session policy. `createOwned`/`restoreOwned` are asynchronous ownership-aware variants when Redis leases are explicitly enabled. `get`, `has`, `all`, `filter`, `find`, `destroy`, `clear` and `destroyAll` operate on this manager's registry.

| Player API | Semantics / important result |
| --- | --- |
| `connect(options?)`, `disconnect()` | Application gateway/voice handshake lifecycle |
| `play(trackOrOptions?)` | Resolves/prepares before consuming the selected queue entry; inspect returned boolean |
| `pause()`, `resume()`, `stop()` | Serialized playback commands; await completion |
| `seek(position)` | Position in milliseconds; local state is committed after backend acknowledgement |
| `skip(index?)`, `back()`, `replay()` | Queue/history/repetition commands with rollback and intent guards |
| `setVolume(volume)` | Existing synchronous optimistic API; does not prove remote acknowledgement |
| `setVolumeAsync(volume)` | Awaited confirmed volume update |
| `setLoop(...)`, `setAutoPlay(...)`, `setAutoLeave(...)` | Application policies; not server guarantees |
| `filters` | Typed filter controller; backend capabilities still apply |
| `updatePlayer(payload, noReplace?)` | Advanced typed raw player update, with backend extension admission |
| `updateVoice(voice)` | Advanced voice-state boundary; never log the payload |
| `exportSnapshot()` | Detached versioned player snapshot |
| `transferNode(...)`, `restart(...)`, `softRestart(...)` | Inspect result; a failed/cancelled operation is not recovery success |
| `destroy(reason?)` | Idempotent local/backend teardown |

Queue methods include `add`, `insert`, `get`, `remove`, `shift`, `unshift`, `pop`, `clear`, `shuffle`, range operations, deduplication, sorting, move and duplicate. Positions are zero-based. `add`/`insert` validate serializable entries before mutation. Duplication creates independent tracks/metadata. Avoid directly mutating the compatibility `queue.tracks` array when command methods can preserve invariants.

Track optional projected properties depend on `trackPartial`; use `track.getInfo()` for complete retained wire metadata. TrackCodec serializes snapshots, TrackResolver resolves on the destination backend and Track.clone isolates mutable metadata. An encoded track's existence is not proof that its source works on every node.

Destination metadata fallback is **opt-in** via `options.search.trackResolution` and accepts allowed search sources, a minimum similarity score, duration tolerance, a per-response candidate limit and an optional `timeoutMs` (1–60,000; 10,000 by default). The total timeout is **shared across all source/ISRC/title queries**, not reset per source. `TrackResolver.resolve(track, target, source?, signal?)` accepts an optional cancellation signal. Normal playback, queue-preload and migration now propagate their current intent signal, so an obsolete HTTP lookup can be cancelled on a newer play/stop/transfer request. Cancellation still needs a responsive transport; do not assume arbitrary injected providers obey abort signals. A metadata match is not proof of audible playback.

## Nodes, compatibility and recovery

Only Lavalink v4 and NodeLink are supported backend families. `manager.nodes.findNode(options)` selects according to readiness and explicit constraints; `getBackendInventory()` returns detached evidence, not credentials. A capability can be advertised, observed, unknown or unavailable. Inspect actual availability rather than assuming all NodeLink features or Lavalink plugins exist.

Optional `scoreWeights` combine measured costs, and `preferredNode`/`minimumScoreImprovement` provide caller-scoped hysteresis after eligibility and preferences. See [node selection](node-selection.md) and the compiled `examples/node-selection.ts` recipe.

`node.refreshBackend()` coalesces refreshes and returns success/failure. `node.probe()` observes backend health; `node.ping()` requires a transport. `NodeHealthMonitor`, `NodeSelector`, `NodeCircuitBreaker` and NodeFailover are available for advanced consumers. `drain(identifier)` stops new placement and attempts migration; `eject(identifier)` additionally removes the node according to its result. Failed/partial migrations and orphaned players must be handled explicitly.

Playback intent, player registration identity and node/session/transport ownership fence delayed recovery work. `VoiceRecovery` is internal and shared by worker failures and special voice close codes. It does not let a late `restart()` destroy a newer user intent, and it resets the reconnect budget only on acknowledged recovery. This client correctness does not certify audible continuity.

## Optional backend features

| Feature | Public entry points / constraints |
| --- | --- |
| NodeLink mixer | Player `addMix`, `getMixes`, `updateMixVolume`, `removeMix`; typed 0..1 mix volume, see [mixer](mixer.md) |
| Crossfade/fading | Player `setCrossfade`, `clearCrossfade`, `getCrossfade`, `setFading`, `clearFading`; acknowledgements do not prove audible overlap |
| Queue preload | Player `setNextTrack`, `clearNextTrack`, `getNextTrack`, `setQueuePreload`; respect queue/intent ownership |
| Source health | Node `getSourceHealth()` and source-health events; unknown data does not establish a healthy source |
| Lyrics/captions | Node `loadLyrics`, Player subscription APIs; provider/language availability is backend dependent |
| Chapters/meaning | Player `loadChapters`, `loadMeaning`; optional source/backend extensions |
| NodeLink groups/SponsorBlock | Low-level Rest group/state APIs; no local queue or audible synchronization guarantee |
| Stream formats/direct streams | Node stream APIs and typed formats; validate stream framing and consume/close the returned stream |
| Lavalink LavaLyrics | `node.getLavaLyrics(...)`; separate detected plugin and route |
| Lavalink SponsorBlock | Node category get/set/clear; separate contract from NodeLink SponsorBlock |
| VoiceReceiver | Optional NodeLink receiver; explicit application consent, lifecycle and privacy required |
| YouTubeLiveChat | `node.createYouTubeLiveChat(...)`; separate bounded optional connection lifecycle |

See [NodeLink](phase-3-nodelink.md), [Lavalink plugins](phase-4-lavalink.md), [compatibility evidence](backend-compatibility.md) and [real voice acceptance](live-voice-verification.md). No automatic Native Voice, FFmpeg, internal audio backend or client-side source extraction was added.

## Persistence and distributed applications

Memory and Local implement the storage boundary; RedisStorage accepts an injected Redis command client. Snapshots have validated schemas/revisions. Redis leases add CAS/fencing and per-guild ownership only when explicitly configured. RedisGuildIpcRouter uses `nyxlink/guild-voice/2`, monotonic sequences and deduplication; authenticated IPC and gateway delivery belong to the host application. Do not share one guild's active voice session between unfenced owners. See [Redis storage and IPC](redis-storage.md).

## Logging, telemetry and extensions

Logger, JsonLogTransport, typed LogTransport/StructuredLogRecord, diagnostics, async trace scopes and TerminalDashboard are opt-in. `logger.playerTrace(guildId, options?)` provides a bounded retained-event view; migration stages expose actual acknowledgements and partial cleanup/rollback results. Rest HTTP/open-stream observations preserve request overloads and omit raw request/response secrets. See [logging guide](logging-guide.md), [private metrics](private-metrics.md) and [extension lifecycle](extensions.md). The SDK installs no Pino, Redis or OpenTelemetry service. The extension contract is trusted application code and cannot be used as an untrusted-code sandbox.

## Error handling

Catch rejected async commands and inspect typed `code`/status where present. FeatureUnavailableError, ProtocolResponseError, NoEligibleNodeError, CircuitOpenError, HttpError, HttpPolicyError, TrackResolutionError, snapshot validation/conflict, PlayerOperationCancelledError and ExtensionLifecycleError distinguish different boundaries. A missing session/player is different from an unsupported route. An invalid response must not be treated as a capability success. Avoid retrying a non-idempotent mutation merely because its response was lost.

`logger.reportError` produces redacted advice from known errors; it does not automatically retry or fix backend behavior. Application event observers should also catch their own failures. The optional ExtensionContext observer wrapper provides isolation for hooks registered through it.

## Version and release status

The manifest stays on its existing development version/channel. No RC, stable tag or npm publish is implied. The original 38-task backlog and the 24-chapter modernization are tracked separately in [master reconciliation](master-plan-reconciliation.md) and [modernization checkpoint](modernization-status.md). Unexecuted Docker, Redis, remote CI, legal/ownership and audible acceptance gates remain open.
