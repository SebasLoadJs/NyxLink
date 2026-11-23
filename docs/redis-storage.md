# Redis storage (optional) — Phase 5 / P3-036

NyxLink supports the existing local/in-memory StorageAdapter as before. For a bot spanning separate processes, shards or instances, applications can opt into the Redis 7+ adapter. **No Redis package or server is started by NyxLink**. A Redis client and the Redis server are deployed and secured by the application operator.

## Connecting an external client

Install a Redis client in the **bot application**, not in NyxLink:

~~~sh
npm install redis
~~~

~~~js
const { createClient } = require('redis');
const { Manager, RedisStorage } = require('nyxlink');

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', error => console.error('Redis connection error', error.message));
await client.connect();

const storage = new RedisStorage({
  client: { sendCommand: args => client.sendCommand(args) },
  namespace: 'obey_staging', // unique per bot environment
});

const manager = new Manager({
  nodes: [{ identifier: 'eu-1', host: process.env.NODE_HOST,
    port: Number(process.env.NODE_PORT),
    password: process.env.NODE_PASSWORD, secure: true }],
  options: { database: { type: 'external', adapter: storage } },
});

// Attach a Discord connector or gateway sender as usual before initialization.
await manager.init(process.env.DISCORD_CLIENT_ID);

// On shutdown, after voice/gateway operations stop:
await manager.shutdown();
await client.quit(); // NyxLink deliberately does not close your Redis client.
~~~

The adapter accepts a command transport with one method:
\`sendCommand(args: string[]): Promise<unknown>\`. You may wrap node-redis or
another maintained client. The client must be connected before manager.init().
Connection auth and TLS belong in the application environment.

## Consistency, ownership and limits

- Redis record roots are stored as \`nyxlink:<namespace>:players.<guildId>\`,
  \`nyxlink:<namespace>:nodes.<node-hash>\`, etc. Nested paths are modified
  atomically using Redis EVAL, so writers cannot overwrite unrelated fields.
- Player snapshot revisions use atomic Redis-side compare-and-set. A stale
  revision is rejected; DatabaseManager retries ordinary field updates with
  bounded optimistic concurrency.
- Namespaces isolate separate bot deployments. \`clear()\` deletes only this
  namespace; it does not execute FLUSHDB. SCAN is bounded, but clear is not
  globally atomic and must not run on a production namespace while in use.
- Redis is a remote datastore, so use durable Redis settings appropriate to
  your requirements. Awaited writes do not prove disk persistence unless Redis
  persistence/replication policy is configured accordingly.
- Redis data includes player snapshot metadata and may be sensitive. Treat
  Redis access as privileged and encrypt traffic outside trusted loopback.
- Storage by itself does not install a message bus, select shard owners or
  transfer Discord gateways. The optional `GuildOwnership` and IPC fencing
  modules below coordinate owners, but they cannot prevent every in-flight
  external voice command during a network partition. Shard orchestration
  still must route gateway commands and obey the fencing protocol.
- Different processes should share a namespace **only when the entire
  deployment is intentionally coordinated**. Do not share a namespace between
  independent bots or test/prod environments.

## Optional per-guild ownership leases

\`RedisGuildLeaseCoordinator\` is a separate opt-in coordination primitive. It
can help multiple shard workers agree which process currently handles a guild.
It uses atomic Redis Lua scripts: one active owner, a bounded lease TTL,
explicit renewal, ownership-checked release and a monotonically increasing
**fencingToken** per guild. The token changes when ownership passes to another
process, allowing higher-level systems to reject delayed work from old owners.

~~~js
const { RedisGuildLeaseCoordinator } = require('nyxlink');
const leases = new RedisGuildLeaseCoordinator({
  client: { sendCommand: args => client.sendCommand(args) },
  namespace: 'obey_staging',
  ttlMs: 30000,
});

const guildId = '123456789012345678';
const lease = await leases.acquire(guildId);
if (lease) {
  // Application must verify and renew ownership before accepting voice work.
  const stillOwner = await leases.renew(lease);
  if (!stillOwner) {
    // Cancel current guild work; do not send new play/voice operations.
  }
  // Keep lease.fencingToken with messages to a cooperating, fenced consumer.
  await leases.release(lease);
}
await leases.close(); // does not disconnect the caller's Redis client
~~~

**Critical limitation:** a standalone `RedisGuildLeaseCoordinator` does not
automatically hook into PlayerManager, the Discord gateway or Lavalink/NodeLink
commands. Opt in with `manager.useGuildLeases(...)` to enable the managed
Player/Voice/REST guards and heartbeat described below. The separate IPC router
can check outgoing Discord voice commands at the receiving shard, but a lease
cannot stop previously issued external commands after expiry or a network
partition. **Exactly-one-audible-session behavior is not certified.**

A worker must periodically renew a lease (for example every TTL/3 with a
jitter-aware policy), stop on failure, and release during orderly shutdown.
The standalone coordinator has no heartbeat; `GuildOwnership` enables a
managed heartbeat when explicitly configured. Lease counters persist by
design to preserve fencing monotonicity; do not clear their namespace during
production. Applications should use Redis persistence/HA settings appropriate
to these safety requirements.

The live Redis tests in \`tests/integration/redis-guild-lease.test.cjs\`
verify exclusivity, expiry, monotonically increasing tokens, stale release
protection, multiple guilds and shutdown races. They run together with
storage CAS tests in the Redis 7 GitHub Actions workflow.

## Integrating ownership with Player and voice lifecycle

Calling \`manager.useGuildLeases({ coordinator, renewIntervalMs })\` **before**
creating any players enables lease enforcement for that Manager. Without this
opt-in, all existing synchronous \`players.create()\` / \`restore()\` APIs and
non-Redis storage behaviors remain unchanged.

When enabled, acquiring ownership requires Redis I/O, so use the **async**
APIs \`players.createOwned(config)\` and \`players.restoreOwned(config)\`.
The synchronous \`create()/restore()\` paths reject unowned guilds instead of
racing another shard. Backend PATCH/DELETE, Player.connect(), Voice.connect(),
Voice.disconnect() and player snapshot mutations check the current lease or
its local fence, preventing stale routine operations after ownership loss.

~~~js
const coordinator = new RedisGuildLeaseCoordinator({
  client: { sendCommand: args => client.sendCommand(args) },
  namespace: 'obey_staging',
  ttlMs: 30000,
});
manager.useGuildLeases({ coordinator, renewIntervalMs: 10000 });
manager.on('guildOwnershipLost', (guildId, fencingToken, reason) => {
  // Mark this guild unavailable to this worker.
  // Cancel in-flight jobs and route commands to the new owner.
});
const player = await manager.players.createOwned({
  guildId: '123456789012345678',
  voiceChannelId: '223456789012345678',
});
await player.pause();
await player.destroy('handoff'); // releases the lease after cleanup
await manager.shutdown();        // closes the coordinator
~~~

\`SessionRecovery\` uses \`restoreOwned()\` automatically when ownership is
enabled. The Manager's shutdown closes the lease controller and Redis leases,
but not the caller-owned Redis client. A renewal heartbeat is enabled only
for configured Managers. Lease loss is fail-closed for subsequent Player and
Rest operations; stale destruction skips removing newer persisted snapshots.
Calls to \`database.clear()\` are refused while distributed guild ownership
is active to prevent accidental namespace-wide deletion.

**Boundary:** the public \`manager.send\` callback remains the calling bot's
Discord connector contract. Direct calls to that callback, raw gateway
connections, third-party side effects and in-flight backend HTTP requests
cannot be cryptographically fenced by NyxLink. Only the built-in Player,
Voice and backend REST lifecycle has ownership checks. Operators must route
gateway commands through an ownership-aware dispatcher and validate
fencing tokens in downstream IPC. Do not interpret these guards as proof
of exactly-one-active-Discord-voice-session across a network partition.

### Acceptance and scenarios

- \`tests/integration/redis-player-ownership.test.cjs\`: two real Redis clients
  and separate Manager instances; competing create/restore; successful
  command; rejected stale command; snapshot preservation and shutdown.
- \`tests/helpers/redis-player-worker.cjs\`: a separate Node.js **OS process**
  creates a Player, hands ownership to another process and verifies a newer
  fencing token and usable playback commands.
- The Redis 7 workflow runs on Node.js 22 and 24. A green workflow proves
  these isolated lifecycle contracts, not audio heard through Discord.

## Optional fenced Discord voice gateway IPC

For distributed bots, \`RedisGuildIpcRouter\` provides a **receiver-side
fencing gate** for Discord voice-state commands. It is opt-in and does not
start a broker or change \`Manager.send\`, which remains the bot's connector
callback. The bot controls how to send and authenticate IPC messages.

A guild owner must first hold an active lease via
\`manager.useGuildLeases(...)\` and \`players.createOwned(...)\`.

**Sender process** (the bot's voice/gateway-routing layer):

~~~ts
import { RedisGuildIpcRouter } from 'nyxlink';

const router = new RedisGuildIpcRouter({
  client: { sendCommand: args => redis.sendCommand(args) },
  namespace: 'obey_staging',
});

const guildId = '123456789012345678';
const envelope = await router.prepare(manager.guildOwnership!, guildId, {
  op: 4,
  d: {
    guild_id: guildId,
    channel_id: '223456789012345678',
    self_deaf: true,
    self_mute: false,
  },
});

// Use an authenticated IPC channel to the worker that owns this Discord shard.
await applicationIpc.send(envelope);
~~~

**Receiving gateway shard process** (must use the **same namespace** and Redis
deployment, but need not own the lease itself):

~~~ts
const result = await router.dispatch(incomingEnvelope, async packet => {
  // Route through the receiving application's actual Discord shard gateway.
  await shardGateway.send(packet);
});

if (result === 'stale') {
  // Lease expired or belongs to a newer owner; never deliver.
} else if (result === 'duplicate') {
  // Same commandId already claimed inside the dedupe TTL.
}
// 'delivered' means the provided callback resolved; it does not prove a
// Discord VOICE_STATE_UPDATE response or audible playback.
~~~

The sender verifies its local lease against Redis and creates a fresh UUID
command ID. The receiver validates the exact Discord voice opcode 4 packet
shape, atomically compares the current Redis fencing generation and claims a
deduplication key **before** invoking the gateway callback.

The possible return statuses are \`delivered\`, \`stale\` and \`duplicate\`.
Invalid envelopes throw \`TypeError\`; Redis failures and callback failures
reject, rather than silently reporting success. Deduplication is
**at most once per command ID within its configured TTL** (1..300 seconds).
A callback that throws has still consumed its command ID: application
retry logic must intentionally prepare a *new command* after checking
ownership and current desired gateway state. Do not blindly replay packets.

**Security and correctness boundary:**

- The fencing generation is **not an authentication secret**. Authenticate
  and authorize the IPC transport separately; Redis credentials never go
  inside the envelope.
- Redis checking and sending to Discord are **not one distributed
  transaction**. A lease can transfer immediately after the check but
  before an external gateway network send. True end-to-end fencing requires
  cooperation from every downstream command consumer.
- NyxLink's normal \`Manager.send\` remains public for backward compatibility.
  Applications that need IPC guarantees must route their gateway sends
  through this fenced path, not invoke a raw \`Manager.send\` from stale
  workers.
- The router validates *only* gateway voice opcode 4. Music-player REST
  commands are protected separately by the player/REST lease checks; this
  does not certify exactly-once audio.
- Redis TTL and lease counter state are part of operational correctness.
  Do not reset production counter keys or reuse namespaces across bots.

The independent-process and real Redis integration tests live in
\`tests/integration/redis-guild-ipc.test.cjs\` and
\`tests/helpers/redis-player-worker.cjs\`. GitHub Actions runs the suite on
Node.js 22 and 24.

## Testing

An isolated, real Redis 7 integration job runs on both Node.js 22 and 24:
\`tests/integration/redis-storage.test.cjs\`, using a dependency-free
test-only RESP client. It validates nested record mutations, false values,
cross-process CAS, concurrent DatabaseManager field writes, exclusive snapshot
imports, namespace boundaries and Redis-client ownership.

Run it locally against a disposable Redis server, after building:

~~~sh
pnpm run build
node --test tests/integration/redis-storage.test.cjs
~~~

Use a dedicated disposable Redis service; tests clean up their unique
namespaces but must not be run against untrusted public Redis hosts.
See the GitHub workflow \`.github/workflows/redis-storage.yml\`.

### Release acceptance still required

Both CI Redis jobs must be green on the final candidate commit. Real
multi-process Discord voice control, shard routing, graceful failover
and any future lease/IPC transport must be evaluated separately before
claiming distributed voice-session ownership. No npm publish or stable
tag is performed by this adapter.
