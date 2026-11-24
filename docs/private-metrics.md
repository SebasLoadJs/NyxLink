# Private metrics and observability (optional)

NyxLink does not open an HTTP listener when a Manager is constructed. An operator can opt into a **read-only, loopback-only** diagnostics endpoint for OBEY or another bot's private operational dashboard.

## Example

Use an unpredictable token of at least 32 characters from a **secret manager or environment variable**. Do not commit it, place it in a URL, or print it in application logs.

~~~js
const { Manager } = require('nyxlink');

// Construct and configure the Manager normally.
// The endpoint is never started automatically.
const token = process.env.NYXLINK_METRICS_TOKEN;
if (!token) throw new Error('NYXLINK_METRICS_TOKEN must be configured');
const endpoint = await manager.startPrivateMetricsServer({
  token,
  host: '127.0.0.1',
  port: 0, // replace with an operator-chosen local port
});
console.log('Metrics listener started on local loopback');

// During application shutdown:
await manager.shutdown(); // also closes all registered private metrics listeners
~~~

Clients must include the header Authorization: Bearer **your-secret**. Only exact GET routes are available:

| Path | Response | Sensitive fields excluded |
| --- | --- | --- |
| GET /health | Service health boolean | All application/Discord IDs |
| GET /nodes | Opaque 16-char SHA-256 node keys; backend family, readiness, draining and counts | Hostnames, ports, passwords, Discord guild IDs, sessions, tracks |
| GET /players/summary | Aggregate total/playing/paused counts | Guild, user, voice and track information |
| GET /logging | Logger configuration state and aggregate delivery/drop/failure counters | Log messages, context, timeline and application identifiers |
| GET /versions | NyxLink version and connected backend versions when safely formatted, keyed by opaque node hash | Raw node identifiers, unvalidated remote metadata or credentials |
| GET /metrics | Prometheus plaintext gauges and optional logger counters with fixed names | Dynamic labels, IDs and credentials |

Unauthenticated requests return 401. Other methods return 405 after authentication. No query-string selectors or playback-control endpoints are supported. The server does not maintain request history, metrics by user, stream audio, or expose filesystem access. The response disables caching and framing.

## Deployment boundary

- Binding is restricted to 127.0.0.1 or ::1. Public binding (including 0.0.0.0 and localhost ambiguities) is rejected even when a token is provided.
- The built-in endpoint is HTTP on the local host. For remote dashboards, put an authenticated HTTPS/TLS reverse proxy or VPN under separate administrative control; never forward the raw listener directly to the internet.
- Metrics tokens are compared using SHA-256 hashes with constant-time equality, but this does **not** replace transport security or a robust secret policy.
- The endpoint exports **only fixed aggregate gauges/counters**, so it cannot reveal listening histories or become a high-cardinality Prometheus source. When a manager owns a logger, its written/dropped/critical-drop/transport-error/sampled/grouped totals are counters and its queued records are a gauge.
- Each Manager explicitly owns the listeners it starts and closes them during shutdown. Application code may call endpoint.close() earlier; repeated close is safe.
- Node keys are opaque stable hashes of configured identifiers, **not secret cryptographic anonymization guarantees**. Do not release them publicly or use them to infer users.

## Validation

The deterministic tests in tests/private-metrics.test.cjs cover authentication, loopback-only binding, type and route validation, absence of secrets and Discord IDs from JSON and Prometheus payloads, clean shutdown, and concurrent listen/close. The TypeScript surface is checked in tests/types/public-api.ts.

**Scope limit:** No Redis, shared storage, multi-process aggregation, dashboard hosting, Prometheus scraping configuration, authentication gateway or externally exposed admin panel is installed by the library. This serves one Manager instance. Multi-process aggregation belongs to an authorized infrastructure layer and requires its own access and privacy review.

No release or npm publication is implied by this feature. The end-to-end acceptance gate remains in [release runbook](release-5.3-rc-runbook.md).

### Canonical logging metrics

`/logging` reports whether the canonical Aurora route is attached, its accepted/filtered/targetErrors/criticalTargetErrors counters and closed flag. `nyxlink_log_target_accepted_total` counts successful target invocations, not confirmed disk or terminal writes. `nyxlink_log_filtered_total`, `nyxlink_log_target_errors_total` and `nyxlink_log_critical_target_errors_total` are route-local. Queue/stream rejection counts belong to the host TerminalCoordinator and are not fabricated by the private endpoint. The removed legacy logger counters no longer describe Manager logging.
