# Phase 5 — playback recovery ownership guards

## 5.1 NodeLink WorkerFailedEvent

The NodeLink worker-failure event contains a list of affected guild IDs. Its notification is scoped to the **specific backend node that sent it**; a delayed event cannot recover a player that has already migrated to another backend.

**Previous risk:** the event handler looked up a player by guild ID and could disconnect, remotely delete, reconnect, restart or destroy it even if its owning node/session changed or its user had started newer playback. The asynchronous gaps included voice disconnect, player deletion, the 750 ms retry delay and voice connection.

**Current contract:** before any side effect, the handler captures the reporting node's session, transport, backend generation, the player's registration identity, ownership and playback-intent generation. It checks these after every asynchronous boundary, including before any destructive error fallback. A new play, stop, migration, replacement, node shutdown or session rotation invalidates the old worker's recovery. Invalid guild IDs are ignored and duplicates are deduplicated. Arbitrary upstream error messages are not interpolated into application debug logs. The existing worker-recovery progress flag is cleared upon exit.

Test coverage in `tests/worker-failure-ownership.test.cjs`:

- A late source-node failure cannot disconnect a player already migrated.
- A user stop during an awaited disconnect cancels subsequent backend deletion/reconnection.
- A new node session prevents the older handler from starting voice after a remote cleanup response.
- A rejected asynchronous disconnect cannot destroy a newer user intent.
- Malformed and repeated guild IDs do not cause extra recovery requests.

**Limitations:** this is an ownership/concurrency regression suite with mocked voice and backend calls. It does not certify Discord audible playback, real voice worker resilience, AutoMix, Crossfade or gap-free failover. The 750 ms cooldown remains for genuinely current recovery. Verifying real Discord transport and the recovered audio stream is a separate opt-in acceptance milestone; the harness does not connect a bot to any server.
