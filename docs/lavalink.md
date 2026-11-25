# Lavalink v4

NyxLink supports the core Lavalink v4 REST and WebSocket protocol, session recovery, filters and playback control. Optional plugins must be installed and advertised by the connected server. Their contracts are distinct from NodeLink's extensions.

## LavaSearch

Advanced search uses the Lavalink LavaSearch plugin and an enabled compatible provider (for example LavaSrc).

```ts
if (node.backend?.supports('lavasearch')) {
  const results = await node.loadSearch('spsearch:Architects', {
    types: ['track', 'album', 'artist', 'playlist', 'text'],
    signal: AbortSignal.timeout(10000),
  });
  // HTTP 204 => null. Other successful responses keep provider plugin metadata.
}
```

The typed response preserves optional result arrays; album, artist and playlist entries are discovery results, not necessarily playable tracks. This low-level node API does not implement application catalog policies. Unsupported backends are rejected without sending a request. A malformed response or provider error is not an empty search. See the [plugin contract](https://github.com/topi314/LavaSearch).

## LavaLyrics

```ts
const lyrics = await node.getLavaLyrics(track, { skipTrackSource: false });
```

Requires the LavaLyrics plugin. Returns validated lyrics or `null` for HTTP 204; provider errors are not equivalent to missing lyrics. LavaLyrics 1.1.0 can return HTTP 500 when no lyrics manager is registered.

## SponsorBlock

```ts
const categories = await node.getLavalinkSponsorBlockCategories(guildId);
await node.setLavalinkSponsorBlockCategories(guildId, ['sponsor', 'selfpromo']);
await node.clearLavalinkSponsorBlockCategories(guildId);
```

The category API requires the SponsorBlock plugin. Valid categories include sponsor, selfpromo, interaction, intro, outro, preview, music_offtopic and filler. Unsupported or malformed requests are rejected before transport. An absent guild record can return HTTP 404.

## Compatibility

The integration laboratory uses pinned Lavalink 4.2.2, LavaLyrics 1.1.0 and SponsorBlock 3.0.1, with verified plugin JAR hashes. REST and startup validation do not certify lyric availability, audible segment skipping or real Discord voice. See [backend compatibility](backend-compatibility.md) and the [public API](api-reference.md).

Upstream: [Lavalink](https://lavalink.dev/) · [LavaLyrics](https://github.com/topi314/LavaLyrics) · [SponsorBlock](https://github.com/topi314/SponsorBlock-Plugin).
