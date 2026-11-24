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
