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


## LavaDSPX

Install the [LavaDSPX plugin](https://github.com/devoxin/LavaDSPX-Plugin) on the Lavalink node. Its registered plugin name is `lavadspx-plugin`. These are plugin filters, not the native NodeLink controls.

```ts
if (player.node.backend?.supports('lavadspx')) {
    player.filters
        .setLavaDSPX('high-pass', { cutoffFrequency: 80 })
        .setLavaDSPX('normalization', { maxAmplitude: 0.8, adaptive: true });
    await player.filters.apply();
}
```

The keys are `high-pass`, `low-pass`, `echo` (seconds and decay), and `normalization` (peak amplitude and adaptive flag). Omit the value to remove an effect. Zero decay/amplitude is rejected by the typed helper because the inspected upstream implementation disables those effects. Recovery's compatible-only filter projection omits DSPX-shaped settings on unsupported destinations and preserves the desired settings locally. Generic plugin filters remain extensible and are not all guaranteed portable.

## LavaSrc collection and track metadata

```ts
const result = await manager.search({ query: url });
const collection = result.getLavaSrcMetadata();
const trackMetadata = result.tracks[0]?.getLavaSrcMetadata();
```

The typed views expose album/artist artwork, preview URL and preview flag, collection type, URL, author and total track count. Unknown fields are preserved in raw `playlistPluginInfo` and track `pluginInfo`. A collection's provider-reported total can differ from the number of tracks returned by a limited search. Metadata does not guarantee direct audio playback. See [LavaSrc](https://github.com/topi314/LavaSrc#plugin-info). Runtime configuration and live plugin acceptance remain separate work.
