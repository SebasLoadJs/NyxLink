# NodeLink mix layers

The existing four Player methods now expose typed responses and run through the player's command queue. No new backend route is introduced.

| Method | Result | Contract |
| --- | --- | --- |
| `addMix(track, options?)` | `Promise<MixLayerCreated \| null>` | Encoded track or Track; optional `volume` 0..1 and JSON-serializable `userData` |
| `getMixes()` | `Promise<MixLayersResponse \| null>` | Remote `{ mixes: MixLayerState[] }` observation |
| `updateMixVolume(id, volume)` | `Promise<this>` | Acknowledged PATCH; finite volume 0..1 |
| `removeMix(id)` | `Promise<this>` | Acknowledged DELETE |

`MixLayerCreated` contains `id`, `track` and `volume`; `MixLayerState` additionally contains nonnegative `position` and `startTime`. Creation/listing responses validate identities, track metadata, volume, state and duplicate IDs before learning capability availability. Invalid inputs fail before HTTP; a 2xx malformed response raises `ProtocolResponseError`. An empty bare array is not the documented collection envelope and is rejected.

The contract was reviewed against NodeLink revision `97bbce1e169f18811c69836e3d0fa7f87e1d13fe`: [collection route](https://github.com/PerformanC/NodeLink/blob/97bbce1e169f18811c69836e3d0fa7f87e1d13fe/src/api/sessions.id.players.id.mix.ts) and [item route](https://github.com/PerformanC/NodeLink/blob/97bbce1e169f18811c69836e3d0fa7f87e1d13fe/src/api/sessions.id.players.id.mix.id.ts). These are protocol observations; no server implementation was copied into the client. Creation `userData` is preserved as a compatibility input, but the reviewed route reconstructs track metadata from the encoded track, so caller metadata round-trip is not guaranteed.

Concurrent Player mix calls execute in order. A failed call does not poison subsequent commands. User playback intent changes, disconnect/destruction, node migration, transport/session replacement or adapter replacement invalidate queued/in-flight operations with `PlayerOperationCancelledError` (`PLAYER_OPERATION_CANCELLED`). An already-sent mutation might still have happened remotely; cancellation does not claim transactional rollback on the server. Direct Rest calls remain the low-level boundary and do not join the Player command queue.

Mixes are backend-owned. NyxLink does not keep a speculative local mix cache, copy layers during migration, promise audible synchronization or infer cleanup from a local command. Handle mix-end events/404s and explicitly remove layers your application owns; backend auto-cleanup depends on its configuration. Unsupported Lavalink calls fail before HTTP. Full mixer concurrency/audio/cleanup acceptance against pinned real servers and Discord is still required.

See [compiled example](../examples/observability.ts) and `tests/mix-lifecycle.test.cjs` for HTTP response validation, command ordering, rejected operations and stale-session cancellation.
