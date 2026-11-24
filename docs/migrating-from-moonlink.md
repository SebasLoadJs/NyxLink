# Migration guide: Moonlink to NyxLink

> **Release status:** this guide describes the current `dev` API. NyxLink `v5.3.0` has not been released. Confirm the npm dist-tag and migration compatibility on the exact release candidate before deploying to production.

## Prerequisites and installation

- Use Node.js **22.12.0 or newer**. Node.js 22 and 24 are covered by automated TypeScript and package-consumer checks.
- Run an accessible, separately managed Lavalink v4 or NodeLink server. NyxLink is a client library, not an audio server.
- If moving from Moonlink, preserve existing server credentials in your application's secrets manager rather than copying them into the repository.
- During the pre-release migration use `npm install nyxlink@dev` (or `pnpm add nyxlink@dev`). After a stable npm publication, prefer a pinned verified version, e.g. `nyxlink@5.3.0` **only when that version actually exists**.

## Import and setup changes

Replace your Moonlink package import with the NyxLink package name. The entrypoint exports `Manager`, `Node`, `Player`, `Track`, `Queue`, `Rest`, `Filters`, `Connectors`, and the other named public types.

```js
const { Manager, Connectors } = require('nyxlink');

const manager = new Manager({
  nodes: [{
    identifier: 'eu-primary',
    host: process.env.LAVALINK_HOST,
    port: Number(process.env.LAVALINK_PORT),
    password: process.env.LAVALINK_PASSWORD,
    secure: true,
  }],
  options: {
    database: { type: 'memory' },
    resume: true,
    node: { autoMovePlayers: true },
  },
});

// Register the integration before client.login().
manager.use(new Connectors.DiscordJs(), discordClient);
```

Consult `examples/discordjs.cjs` and `examples/discordjs.ts` for full applications. The Discord.js connector is a separate integration; `@discordjs/voice` is **not required by the NyxLink core**.

## Behavior to review in an existing bot

| Area | Migration check |
| --- | --- |
| Playback operations | `await player.play()`, `await player.skip()` and `await player.transferNode(...)` return success booleans. Do not display successful playback until the operation succeeds. |
| Seek | `player.seek(positionMs)` takes a nonnegative finite millisecond position and serializes with playback commands. |
| Volume | `player.setVolume(value)` is a synchronous/chainable setter. Use `await player.setVolumeAsync(value)` for an acknowledged backend update. |
| Autoplay and queue | User-scheduled playback takes precedence over pending recommendation lookups. Exercise stop, manual play, queue and repeat commands together. |
| Node selection | Node identification must be unique. Optional `nodeSelection` enforces backend/capability/region requirements. Invalid requirements are rejected. |
| Failover | `manager.nodes.drain(identifier)`, `eject(identifier)` and `player.transferNode(...)` return results that must be checked. A cancelled transfer is **not** successful recovery. |
| Features | Read `node.backend`, `node.capabilities` and `manager.nodes.getBackendInventory()`. Do not assume a NodeLink feature or Lavalink plugin is enabled simply because the server family supports it. |
| Storage and resume | New node-session records are scoped by node identifier as well as endpoint; a legacy endpoint-only record is read only when the endpoint is unambiguous. Test upgrades with persistent storage. |
| Events and logging | Aurora logging is opt-in through manager logging options, silent by default. Subscribe to events such as `playerNodeFailover` and `playersOrphaned` for diagnostic handling. |

## Backend-specific additions (opt-in)

NodeLink capabilities include source-health telemetry, server-side crossfade controls, queue preload, remote mix/group controls, SponsorBlock, and lyrics/caption request options **where exposed by the connected server**. See `docs/phase-3-nodelink.md` for exact methods and constraints.

Lavalink optional LavaLyrics and SponsorBlock integrations are separate from NodeLink APIs. The detected plugin and route must both be supported. See `docs/phase-4-lavalink.md`.

Never mistake successful HTTP control acknowledgement for audible crossfade, live AutoMix, or sample-accurate gapless audio. Those require controlled Discord voice testing.

## Migration verification

Run these commands against the exact commit and backends you intend to deploy:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck:strict
pnpm run test:coverage
pnpm run test:types
pnpm run test:package
pnpm run pack:check
NYXLINK_CONTAINER_ENGINE=docker pnpm run test:backends
NYXLINK_CONTAINER_ENGINE=docker NYXLINK_NODELINK_PROFILE=modern pnpm run test:backends
NYXLINK_CONTAINER_ENGINE=docker pnpm run test:extensions
NYXLINK_CONTAINER_ENGINE=docker pnpm run test:lavalink-plugins
```

For Discord voice and audible transition checks, follow `docs/live-voice-verification.md`. That harness requires explicit permission and separately configured credentials; it is not part of ordinary CI. Only approve the stable release after its results and the release candidate's package-consumer checks are reviewed.

## Local modernization additions

Aurora replaces the previous standalone Logger and legacy transports. Configure `options.logging: {level, target}` with a native Pino target or the `nyxlink/aurora` pipeline; use `AuroraInspectorStore` for retained sanitized events and traces, and `diagnoseError` for explicit error advice. Close the host-owned pipeline after Manager shutdown. No legacy compatibility adapter is supplied. See [logging-guide.md](logging-guide.md).

Mixer responses now have explicit types and runtime validation. `getMixes()` returns `{ mixes: [...] }`, not an unchecked bare array; mix volume is 0..1. Player mixer commands are serialized, and lifecycle changes may reject with `PLAYER_OPERATION_CANCELLED` after a mutation has already reached the old server. Catch that separately from a current-session backend failure. See [mixer.md](mixer.md).

`useExtension` is optional and additive; existing connectors and injected resolvers/storage continue unchanged. Its hooks are typed and isolated, with explicit setup/cleanup deadlines. See [extensions.md](extensions.md).

## Rollback

Keep the previously working Moonlink deployment and configuration available. If the new client fails acceptance tests, redeploy the known-good package and backup of its application state. Never point two running processes at the same Discord guild voice session during rollback.
