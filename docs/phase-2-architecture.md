# Phase 2 — Multi-backend architecture

Phase 1 baseline: accepted at 5f29811 after strict validation and a passed 600-second protocol endurance workload. Live Discord voice remains a release gate.

## 2.1 Capability inventory

- Shared v4 transport remains in Rest.
- BackendAdapter owns CapabilityRegistry and validated advertised plugin inventory.
- Capability evidence distinguishes core protocol, advertised metadata, observed endpoint responses and unknown features.
- Observed unavailable takes precedence over advertised availability. Plugin presence does not imply every endpoint is enabled.
- NodeSelector continues to require positive availability for hard capability constraints.
- Late REST and stream observations cannot modify a replacement connection's adapter.
- Existing string capability names and public methods remain compatible.

## Next increments

1. Connection-scoped detection and refresh lifecycle; inventory inspection at manager level.
2. Typed common protocol contracts; separate backend-specific payloads without copying GPL server implementations.
3. Endpoint capability declarations and extension routing, with explicit unsupported reasons.
4. Provider/plugin feature matrix and contract tests against pinned backend versions.
5. Migration compatibility and selection tests, including unknown capabilities.

NodeLink-specific new features and expanded Lavalink plugin integrations belong to phases 3 and 4. Do not infer support from a product name or plugin presence.

## 2.2 Connection-scoped inventory

`Node.refreshBackend()` coalesces requests per connection and reports success or failure. A successful refresh replaces the adapter atomically and resets observed endpoint state; failed explicit refreshes preserve the previous successful inventory. Opening a new connection clears old advertised metadata before emitting its connected state. Disconnect and destruction invalidate pending refreshes. `manager.nodes.getBackendInventory()` returns detached entries, with source/filter/plugin evidence and timestamps when available, never including connection credentials or raw server information. Disconnected nodes expose no current capability claims. Old adapter references remain independent for diagnostics and track provenance.

## 2.3 Shared player protocol contracts

The public contracts distinguish common v4 player operations from NodeLink-only extensions. BackendAdapter.preparePlayerUpdate centralizes extension admission, including explicit null/false values. The legacy raw extension boundary retains additional plugin fields. Both Player and direct Rest callers use this policy. Lavalink's documented endTime field is common rather than NodeLink-only ([v4 Update Player](https://lavalink.dev/api/rest#update-player)). Session update responses have a typed contract. Further REST response validation and explicit endpoint routing remain separate increments.
