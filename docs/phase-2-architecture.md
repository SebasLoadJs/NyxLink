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
