# NyxLink Aurora logging and observability

The Manager accepts only the canonical Aurora configuration. Logging is silent by default; importing the core package does not start a terminal UI, log destination, SDK exporter, or dashboard timer. A Manager has one automatic event route. Explicit host-owned transports are opt-in.

## Quick start

Install the optional terminal peers using [Aurora installation](aurora-installation.md).

```ts
import { Manager } from 'nyxlink';
import { createAuroraPipeline } from 'nyxlink/aurora';

const pipeline = createAuroraPipeline({ format: 'aurora', level: 'info' });
const manager = new Manager({
  nodes: [{ host: '127.0.0.1', port: 2333, password: process.env.AUDIO_NODE_PASSWORD! }],
  options: { logging: { level: pipeline.level, target: pipeline.target } },
});
try {
  pipeline.banner(manager);
  // Configure your Discord connector before initializing the Manager.
} finally {
  await manager.shutdown();
  await pipeline.close();
}
```

Choose exactly one output: silent, JSON, pretty, Aurora, custom target, or the explicit native file pipeline. JSON has no terminal decoration. Aurora owns its selected terminal stream and bounds persistent writes; non-TTY, CI and NO_COLOR use static output. The Inspector is an explicitly owned separate terminal view: close the output pipeline first or use a separate stream. The simulated demo does not prove audio playback.

Manager logging accepts only level, target, categories and traceContext. Events use the canonical allowlist (eventCode, category, severity, outcome, timestamp, sanitizedContext and optional observed durations and correlation). Never infer audio audibility from protocol acknowledgement or stream completion from response headers. Unknown values stay unknown.

## Structured file and optional telemetry

See [Aurora installation](aurora-installation.md) for exact peer versions and public subpaths. The file pipeline creates a new private NDJSON file, refuses overwrite, bounds admission and reports saturation or I/O failure during close. Configure it as the Manager's single target.

The host SDK can be started explicitly before Pino, with an explicit OTLP endpoint. With exportLogs enabled, wire emitAuroraEvent to the selected pipeline's onEvent callback; automatic Pino log sending remains disabled. Raw application logs, backend payloads and user credentials must never be exported by this path. The host owns SDK startup and shutdown. Without an endpoint no OTLP export is configured. Close the Manager, pipeline and host SDK in that order.

## Diagnostics and verification

See [Aurora installation](aurora-installation.md), [private metrics](private-metrics.md) and [final convergence](final-convergence.md). The private metrics server exposes aggregate logging statistics when configured; it does not expose messages or history. The Inspector displays bounded retained events, completed spans and observed snapshots, and exports local reports only on explicit request.

The old standalone Logger, ConsoleReporter and legacy transport classes have been removed. Use Aurora's canonical Manager event route, the native file target, or a single host target; there is no compatibility adapter. Pure error diagnostics and formatting functions remain available without creating a logger. TerminalDashboard(manager, options) reads local snapshots and emits aggregate DASHBOARD_SNAPSHOT records through the existing route. Raw debug events remain explicit application events, never an automatic log source. The 5.3 release remains gated by tests, audit and real-world acceptance.
