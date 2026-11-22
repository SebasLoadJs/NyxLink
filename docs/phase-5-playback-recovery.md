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


## 5.2 Voice WebSocket close codes 4022 / NodeLink 5001

Both close codes used to perform disconnect, remote player deletion, a 750 ms
delay, reconnect and restart without checking whether the source still owned
the player after each asynchronous boundary. A stale 4022 or NodeLink 5001
error could therefore interfere with music already moved to another node or
changed by the user.

The shared recovery path now captures the player's playback intent and
registration identity, the node's session ID, transport and backend generation.
It verifies all of these before and after operations, and before any
destructive error action. Restart is explicitly invoked with
`destroyOnFailure: false` so the nested operation cannot destroy the player
before the outer recovery checks its validity. The original progress flag,
750 ms cooldown and retry counter remain, but the retry counter is reset
only after an in-scope recovery completes.

Dedicated tests cover both codes during migration, user stop, session
rotation and rejected stale disconnect, plus a successful 4022 recovery and
the Lavalink exclusion from NodeLink-only 5001 handling.

**Scope:** this is a deterministic concurrency and ownership regression
suite. Discord transport, audible stream continuity and actual voice-worker
resilience are not established by these tests. Real voice acceptance is
separate and opt-in.


## 5.3 Gapless transition state

Lavalink/NodeLink terminal track-end reasons such as `finished` and
`cleanup` are not equivalent to nonterminal `gapless` and `crossfading`
transitions. Prior code suppressed queue/autoplay for both transition
reasons but preserved `player.playing` only for `crossfading`. A `gapless`
end incorrectly set the player idle and reset pause/position telemetry,
potentially causing UI state to flicker between server-managed tracks.

The gapless branch now preserves the previously confirmed `playing`,
`paused` and `lastKnownPosition` state, exactly as crossfade does.
The next accepted track start or player update becomes the authority
for newer state. These transition events still emit `trackEnd` but do
not consume the queue or launch autoplay. Terminal cleanup continues
to clear player activity and avoid queue advancement.

`tests/gapless-continuity.test.cjs` covers both transition modes,
paused transitions, a real terminal cleanup and stale track ends.

This fixes the **client state machine**, not the audio server's mixing
or sample-accurate gapless playback. Audible gapless quality remains
unverified.
