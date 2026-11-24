# Aurora V4 host observability

The core is a Discord audio client, not an observability server. The host
controls the SDK, sampling, retention and transport. Do not run an SDK per
player or per node. Start the host SDK before loading instrumented Pino.

## Production mode

Use a single explicit JSON pipeline for logs; choose automatic correlation
through `createHostSDK({ automaticCorrelation: true })` OR the manual
`activeTraceContext` callback, not both. Provide the tracer and meter from
the host's registered provider via the Manager telemetry options. Use
`pipeline.target` and `pipeline.level` for Manager Aurora options. Call
`await manager.shutdown()`, `await pipeline.close()`, and
`await sdk.close()` during the host's own shutdown procedure.

The checked-in examples are host integration modules, not mandatory npm
dependencies. See `scripts/test-package.cjs` for the tested exact pins and
isolated install. With no optional packages installed, the default core
remains silent and functional. The examples do require their own imports.

## Optional external infrastructure

| Component | Responsibility |
| --- | --- |
| OpenTelemetry Collector | Receive explicitly configured OTLP HTTP traces and metrics |
| Prometheus | Store/scrape metrics from a configured Collector exporter |
| Tempo | Receive traces through a configured Collector export pipeline |
| Loki | Receive canonical NDJSON logs through a separate host log agent |
| Grafana | Query and correlate the configured data sources |

Send the host's OTLP traces/metrics to an explicitly configured trusted
Collector base URL (e.g. `http://127.0.0.1:4318` for local development).
The host example appends `/v1/traces` and `/v1/metrics`; it does not send
logs. Configure the Collector receivers and exporters according to your
installed distribution/version. The Pino destination must remain singular;
do not forward the same log again via automatic instrumentation. A separate
log agent can ship the JSON output to Loki using the agent's supported
ingestion path. Correlate traces using traceId and spanId as fields, not
high-cardinality metric labels. For remote deployments configure access
control, TLS, authentication, sampling and retention independently.
Never expose a local receiver publicly without protection.

These external services are documented deployment options, not tested
NyxLink runtime dependencies. The repository validates the actual SDK
export against a loopback HTTP receiver, not a deployed Grafana stack.

## Signal semantics

- `nyxlink.events`: bounded vocabulary counter, backend label when known.
- `nyxlink.search.duration`: milliseconds, fixed outcome.
- `nyxlink.operation.duration`: milliseconds, fixed operation and outcome.
- `nyxlink.nodes.connected`: number of connected non-destroyed nodes.
- `nyxlink.players.active`: number of locally playing unpaused players.
- REST stream timing ends at response headers. Connection setup and
  handshake lifecycle are separate. None of these signals certifies
  audible playback or PCM quality.

## Acceptance

Use `pnpm run test:package` for the isolated packed consumer and Linux PTY
fixtures. The workflow attaches ANSI captures and benchmark measurements
to the run; use the SHA under test and do not substitute prior measurements
for the release candidate. See [Aurora installation](aurora-installation.md) and [real voice verification](live-voice-verification.md).
