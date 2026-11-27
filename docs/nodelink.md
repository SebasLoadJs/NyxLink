# NodeLink

NyxLink detects NodeLink and its optional capabilities. Features depend on the server revision, configured providers and observed endpoint support. See [API reference](api-reference.md) for common client operations and [backend compatibility](backend-compatibility.md) for tested profiles.

## Source health and lyrics

```ts
const health = await node.getSourceHealth();
const lyrics = await node.loadLyrics(track, { lang: 'es', type: 'lyrics' });
const selected = manager.nodes.findNode({ preferSource: 'youtube', sourceHealthMaxAgeMs: 120000 });
```

Health observations expire and do not automatically prohibit sources. Lyrics/caption availability depends on providers. `type: 'onlyCaptions'` requests captions when supported.

## Playback extensions

| API | Contract |
| --- | --- |
| `player.setCrossfade(options)` / `clearCrossfade()` / `getCrossfade()` | Acknowledged per-player transition configuration. |
| `player.setNextTrack(track)` / `clearNextTrack()` | Explicit server-side preload; manual queue ownership remains with the caller. |
| `player.setQueuePreload({ enabled: true, leadMs: 35000 })` | Opt-in automatic queue reservation with crossfade; excludes incompatible modes. |
| `player.addMix(...)` / `getMixes()` / `updateMixVolume(...)` / `removeMix(...)` | See [mixer](mixer.md). |
| Group and SponsorBlock APIs | Low-level NodeLink REST contracts; distinct from Lavalink plugins. |

AutoMix is server-side analysis associated with next-track preparation; NyxLink does not invent a separate server toggle. Protocol acknowledgements do not prove audible transitions or synchronized groups.

## Holo metadata

When the server enables Holo Tracks, the TrackStart event can include enriched metadata. Use `track.getHoloMetadata()` to parse the native pluginInfo projection, including JSON-string fields used by newer NodeLink revisions. The original pluginInfo remains unchanged. The result is optional and does not imply an enabled Holo configuration or permission to access any returned URL.

```ts
manager.on('trackStart', (_player, track) => {
    const metadata = track.getHoloMetadata();
    if (metadata) console.log(metadata.channelName, metadata.audioTracks);
});
```

## Streaming

```ts
const formats = await node.getStreamFormats(track);
const { stream, headers, statusCode } = await node.loadSourceStream(track, {
  range: 'bytes=0-65535',
});
// Consume or destroy stream; inspect headers and statusCode.
```

Raw PCM is 48 kHz stereo signed 16-bit; WAV wraps PCM. The format catalogue is JSON, not audio. Passthrough returns source-container bytes without decoding; HTTP 200 does not guarantee an accepted Range. These newer routes need a compatible NodeLink revision. The pinned lab validates PCM decoding and volume; seek evidence and newer source formats are recorded separately in [compatibility](backend-compatibility.md).

## Live chat

```ts
const chat = node.createYouTubeLiveChat('authorized-live-video-id', {
  autoReconnect: true, reconnectDelay: 5000, maxReconnectAttempts: 5,
});
chat.on('message', message => console.log(message.content));
chat.on('error', error => console.error(error.message));
chat.connect();
// On shutdown:
chat.close();
```

VoiceReceiver and live chat are optional, application-owned features. Use only authorized sources and handle participant privacy. Unsupported operations can throw `FeatureUnavailableError`.

## Multi-provider recommendation discovery

NyxLink retains its original recommendation path by default. To include additional provider recommendations and prefer NodeLink's native YouTube AutoMix lookup when advertised, enable discovery on the Manager options:

```ts
recommendationDiscovery: {
    providers: ['spotify', 'deezer', 'tidal'],
    timeoutMs: 10000,
    maxCandidates: 20
}
```

The shared deadline covers seed lookups and recommendation queries. Provider seeds must match the recording (valid ISRC, or exact normalized title/artist and duration within 3 seconds). Duplicate recordings are removed from history, queue and candidates, with primary provider precedence. Additional discovery is limited to advertised NodeLink sources; it does not claim those providers can stream audio directly. Existing application preference scoring still applies. Stop, newer playback intent and disabled autoplay cancel outstanding discovery.


## Selected international source routing

The manager accepts canonical names and verified native prefixes:

| Source | Canonical name | Prefix |
| --- | --- | --- |
| Amazon Music | amazonmusic | azsearch |
| Last.fm | lastfm | lfsearch |
| Shazam | shazam | shsearch |
| Songlink | songlink | slsearch |

These prefixes were checked against NodeLink revision `97bbce1e169f18811c69836e3d0fa7f87e1d13fe`. Amazon Music uses the unambiguous `azsearch` prefix rather than its overlapping `amsearch` alias. Last.fm and Shazam are discovery providers; Songlink resolves links rather than supplying an independent audio catalogue. Actual playback remains dependent on the configured backend and provider.

An explicit `node` in Manager.search now routes to that node, without local Spotify/Deezer interception. Provider names and recognized prefix aliases are matched case-insensitively against disabledSources. Empty searches may try configured fallback platforms; a provider error is returned, not silently retried against another provider. Apple Music's pinned NodeLink implementation does not advertise an `amrec` recommendation prefix, so NyxLink uses its existing fallback path.


## Native HLS (5.4 development)

Use `node.rest.createHlsSession(encodedTrack, { segmentDuration: 4 })` to obtain a manifest and an isolated session ID, `getHlsPlaylist(id)` to refresh it, and `getHlsInitSegment(id)` / `getHlsSegment(id, index)` for bounded binary fMP4 fragments. All requests stay on the configured node, never follow manifest URIs, and use existing authentication. Enable the server's HLS endpoint explicitly. Server-side session expiry remains authoritative; the upstream contract has no close route. This API does not host a browser relay or put the node password into an HLS URL. The upstream live manifest may contain no media segments yet. Actual playback and codec compatibility require real server/player validation. [Pinned upstream route](https://github.com/PerformanC/NodeLink/blob/86c6a00d022cbf1cafdbc5eea39a2b7033637485/src/api/hls.ts).

## Read-only operational diagnostics (5.4 development)

`node.rest.getNodeLinkWorkerSnapshots()` returns validated worker metrics with unknown fields removed. `getNodeLinkProfilerStatus({ code, scope: 'all' })` calls the official profiler status endpoint; enable the server endpoint and supply its separate access code. HTTPS is required except for explicitly opted-in literal loopback HTTP. The code goes in a header, not a URL. Responses intentionally omit inspector addresses, paths, raw traces and remote errors. Partial worker failures remain visible as unsuccessful entries. No remote inspector, heap dump, process mutation, file browsing or periodic allocation sampling is triggered by this method. Real enabled-profiler verification is still pending. [Upstream source](https://github.com/PerformanC/NodeLink/blob/86c6a00d022cbf1cafdbc5eea39a2b7033637485/src/api/profiler.ts).

### YouTube OAuth transport

`Rest.exchangeYoutubeOAuth(refreshToken)` sends the credential in a JSON POST to `/v4/youtube/oauth` rather than a URL query. Non-loopback connections require HTTPS; literal loopback HTTP remains available for local testing. The SDK does not follow redirects, retry the exchange, or expose remote error bodies. The server may still log request bodies; configure server-side redaction before using real credentials. Older NodeLink revisions that only support GET are not automatically retried with credentials in the URL.

### Typed administration

Use `getNodeLinkYoutubeConfig(options, validate)`, `updateNodeLinkYoutubeConfig(payload, options)` and `terminateNodeLinkWorker(target, options)` for validated NodeLink-specific operations. The existing legacy methods remain available. Typed administration requires `allowSensitive: true` and HTTPS, or explicit literal-loopback HTTP opt-in. Worker termination additionally requires `confirm: true`, an access code and exactly one worker identifier. It is not invoked automatically by NyxLink. The worker operation can interrupt playback and a successful acknowledgement does not prove recovery. A configuration update acknowledges the number of workers updated, not successful propagation to every worker. Configure server-side credential redaction before real use.

Stream operations reject stale response headers after backend/session/socket replacement or manager shutdown. JSON format discovery is same-origin and does not follow redirects. Raw PCM still accepts older nodes that omit MIME parameters, but explicit sample rate/channel values must agree with 48 kHz stereo. This does not prove the actual audio byte order or native seek behavior, and an already returned stream remains the caller's responsibility to destroy.

### Crossfade capability versus remembered intent

Native Crossfade, AutoMix and next-track preloading are NodeLink operations, not Lavalink v4 features. `Player.getCrossfade()` retains the last acknowledged intent for recovery. Use `Player.getCrossfadeStatus()` to distinguish `unavailable`, `suspended`, `unknown`, `disabled`, and `configured`. The latter describes eligible remembered configuration, not an observed transition. Aurora exposes this status and does not report crossfade as configured on Lavalink. Enabling automatic queue preload requires both native crossfade and next-track eligibility; disabling remains possible after migration.
