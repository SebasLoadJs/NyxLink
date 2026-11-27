# Custom backend plugins

A server plugin and a NyxLink extension are different components. Lavalink plugins run in the JVM (Java/Kotlin/Spring) and NodeLink plugins run on the audio server. NyxLink cannot load their server code in the Discord application. Install and configure the server plugin first. NyxLink reads its advertised name/version from /v4/info; installed metadata alone is not evidence of endpoint availability.

Register the client-facing contract once per Manager:

```ts
const route = manager.pluginRoutes.register({
  backend: 'lavalink',
  plugin: 'my-music-plugin',
  id: 'get-profile',
  scope: 'node',
  method: 'GET',
  path: 'my_music/profile',
  decode(value: unknown) {
    if (!value || typeof value !== 'object' ||
        !('profile' in value) || typeof value.profile !== 'string') {
      throw new TypeError('Invalid music profile');
    }
    return { profile: value.profile };
  },
});

const profile = await node.rest.callPlugin(route, {
  query: new URLSearchParams({ locale: 'en' }),
});
manager.pluginRoutes.remove(route);
```

This is an illustrative custom plugin, not a built-in Lavalink route. Use the exact name advertised by your plugin, in lower case. The same API accepts NodeLink when the server advertises the plugin. For `scope: 'player'`, the registered path is appended to the current session/player URL and the call requires a valid guild ID. Non-GET player calls check guild ownership before transport. Register trusted code only. Use one id per endpoint; the registry is bounded and per-manager. `list()` returns detached descriptors without decoder functions.

The registry does not expose arbitrary URL or header forwarding, core endpoint overrides, path traversal, redirects, or automatic retries. It uses bounded HTTP requests and cancellation, preserves HTTP errors and records capability observations only after a successful decoder on the current backend/session. Missing advertisement fails closed; an absent optional plugin does not trigger backend failover. Only explicit unavailable endpoint errors are remembered. A removed route or replaced session rejects late results, but a previously sent mutation may still have executed on the server. The plugin owner is responsible for validating payloads, authorizing server endpoints, and using appropriate per-player semantics; the SDK cannot infer arbitrary plugin state or rebuild it on failover.

For plugin events use the existing `nodeRaw` event with a trusted schema validator, or wrap it in `manager.useExtension` for automatic listener cleanup. Sources use the normal search/load/decode flow; plugin-specific filters can use `player.filters.setPluginFilters` where appropriate. None of these mechanisms installs, sandboxes or executes a JAR inside NyxLink.

[Server-side Lavalink plugin development](https://lavalink.dev/api/plugins) · [NodeLink plugin development](https://nodelink.js.org/docs/advanced/plugin-development) · [Extension lifecycle](extensions.md)

## Dynamic paths and unversioned plugins

Use named single-segment placeholders after a literal namespace, such as `my_music/profiles/:profileId`, and pass `{ params: { profileId: 'studio-1' } }` to `callPlugin`. Missing, extra, repeated, encoded or path-like values are rejected before transport. For a node-scoped unversioned API, set `prefix: 'root'` and use the exact advertised plugin name as the first path segment or `plugins/<plugin-name>/...`. The default remains `/v4/`; core endpoints and version prefixes cannot be overridden. These restrictions deliberately exclude arbitrary external URLs and untrusted path fragments.

## Typed custom WebSocket events

```ts
const unsubscribe = manager.pluginEvents.register({
  backend: 'lavalink', plugin: 'my-music-plugin', type: 'ProfileChanged', scope: 'player',
  decode(value: unknown) {
    if (!value || typeof value !== 'object' || !('profile' in value) || typeof value.profile !== 'string') throw new TypeError('Invalid profile');
    return value.profile;
  },
}, (profile, { player }) => { console.log(player?.guildId, profile); });
// Later: unsubscribe();
```

Events must match the declared backend, advertised plugin, event type and scope. The registry validates current player ownership, detaches the payload before decoding, isolates listener failures and clears on manager shutdown. An event matching a declared schema does not prove which plugin emitted it when the wire protocol has no plugin identity. Core dispatch and legacy raw events remain independent. Listeners are trusted application code; async work already started is not cancelled by unsubscribe.

### Extension-owned registrations

Inside `manager.useExtension({ name, setup(context) { ... } })`, use `context.onPluginEvent(definition, listener)` and `context.registerPluginRoute(definition)` to tie registrations to extension removal, failed setup and manager shutdown. The returned route is usable with `Rest.callPlugin`. Event callbacks are gated by the extension's active lifecycle; plugin route registration is available during setup for intentional initialization. In-flight remote mutations cannot be undone by disposal. Do not retain a disposed route.

## Bounded binary plugin responses

Register a route with `binary: { contentTypes: ['audio/ogg'], maxBytes: 1048576 }` to read a finite media response. Its decoder receives a `BackendPluginBinaryResponse` containing `bytes`, `contentType`, and `statusCode`. Media content types are explicit, compressed HTTP responses and redirects are rejected, and both the deadline and size limit apply to the full response. The default limit is 4 MiB and the maximum is 16 MiB. This is a bounded download, not a continuous audio stream or browser proxy. The application must validate the media format before playback. JSON routes remain unchanged.

Player-scoped custom requests require a current NyxLink-managed player on the target node, including reads. Remote-only players created outside the Manager are deliberately not accepted by this API. Replaced or migrated players invalidate in-flight results; a mutation already delivered to the server cannot be undone. Raw event observers receive a detached event payload before native and custom dispatch.
