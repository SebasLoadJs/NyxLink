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
- The adapter does not install a message bus, select shard owners, transfer
  Discord gateways, or prevent **two bots simultaneously creating voice
  sessions for the same guild**. CAS protects saved data, not the live voice
  session. Shard/cluster orchestration still needs coordinated guild routing
  and a documented ownership/lease protocol.
- Different processes should share a namespace **only when the entire
  deployment is intentionally coordinated**. Do not share a namespace between
  independent bots or test/prod environments.

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
