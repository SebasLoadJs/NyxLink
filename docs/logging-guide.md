# Logging and observability

`Logger` remains silent by default. Importing NyxLink creates no log stream, dashboard timer, HTTP endpoint or telemetry exporter. The existing `info(module, message, ...args)`, `warn`, `error`, `debug`, `trace`, `success`, `for(module)`, `box`, `banner`, `systemStatus`, `failover` and attachment APIs remain available.

## Configuration

```ts
import { Manager } from 'nyxlink';

const manager = new Manager({
  nodes: [{ identifier: 'audio-1', host: '127.0.0.1', port: 2333,
    password: process.env.AUDIO_NODE_PASSWORD!, secure: false }],
  options: { database: { type: 'memory' }, logging: {
    profile: 'standard', mode: 'json', maxQueue: 512,
    context: { application: 'music-bot' },
  } },
});
// Configure an application-owned connector before calling init().
```

Detail, rendering and destination are independent:

| Option | Values / behavior |
| --- | --- |
| `profile` | `silent`, `minimal` (warn), `standard` (info), `verbose`/`debug` (debug), `trace`/`diagnostic` (trace) |
| `level` | Explicit `silent`, `error`, `warn`, `info`, `debug`, `trace`; overrides profile |
| `mode` | `pretty` or newline-delimited `json`; default pretty |
| `layout` | `compact` omits timestamps/context; `standard` shows selected operational fields; `detailed` shows full redacted context; `diagnostic` adds sequence/event metadata |
| `color` | Defaults to TTY-only; any defined `NO_COLOR`, including an empty value, disables colors |
| `unicode` | `false` uses ASCII borders and a plain-text banner |
| `width` | 20..500 columns; default derives from terminal width with a bounded fallback |
| `transports` | Injected `LogTransport[]`; supplying them disables the default console destination |
| `console` | Explicitly enable/disable the built-in destination in addition to custom transports |
| `timelineLimit` | 0..10000 records; **0 by default**, so there is no retained event history |
| `maxQueue` | 1..10000 queued records; default 256 |
| `transportTimeoutMs` | 1..30000, default 1000; a failed/timed-out write destination is quarantined |
| `sampleRate` | 0..1; applies only to debug/trace; default 1 |
| `deduplicateMs` | 0..60000; default 0 disables grouping; warn/error are never grouped |

Standard keeps node/guild/backend/trace/status/code/duration/position fields concise. Detailed expands the full redacted context; diagnostic adds record identity. JSON destinations receive the complete bounded record regardless of pretty layout.

In pretty mode, the **observed startup, cluster dashboard and diagnostic headings** use the terminal's semantic cyan/violet/red palette only when colors are enabled. `NO_COLOR`, JSON transports and color-disabled clients remain free from decoration. The `compact` dashboard is a short summary of observed node/player/queue counts rather than a multi-line box; it never invents a health verdict. All colorization happens after the plain-text box has been width-calculated.

## Records, correlation and tracing

Every destination receives the same detached immutable `StructuredLogRecord`: schema version, monotonically ordered sequence, timestamp, level, component, event, message and context. Banners and panels become structured events in JSON mode, with no ANSI escapes or box artwork mixed into JSON.

```ts
import { Logger } from 'nyxlink';

const logger = new Logger({ profile: 'debug', timelineLimit: 100 });
const guildLog = logger.child({ guildId: '123456789012345678' });
await guildLog.traceOperation('play-command', async log => {
  log.event('info', 'Player', 'command.received', { command: 'play' });
  // Await application work here; return values/errors keep their original identity.
});
const records = logger.timeline({ guildId: '123456789012345678', limit: 20 });
logger.playerTrace('123456789012345678', { limit: 20 });
await logger.close();
```

AsyncLocalStorage keeps parallel traces separate and propagates a trace ID to root/child logs within the operation. Nested operations receive distinct operation IDs and a parent operation ID. `traceOperation` emits observed duration on completion/failure; a completion describes that operation, not audible playback.

The manager attachment records selected player, queue, node, source-health, recovery, voice, filters and failover events. Reattaching the same Logger to the same manager is idempotent. The existing legacy debug adapter still preserves raw debug events for application listeners; only the logger's copies pass through its redaction pipeline. Search, player PATCH and NodeLink extension APIs have higher-level spans. All audio Rest buffered HTTP requests and stream openings also have transport spans when the manager logger is enabled, preserving request overloads/results. They record a sanitized route/method/node, never session paths, hostnames, queries, headers, bodies or return payloads. A stream-opening completion means headers arrived, not that audio finished. Gateway/worker internals still rely on their observed lifecycle events; there is no claim of tracing every server-internal stage.

`playerTrace(guildId, { traceId?, limit? })` returns matching retained records and, at info level or above, renders a bounded view (1..20 events) in pretty mode or structured event identities in JSON. An empty/disabled timeline says no retained events; it does not infer a player state. Trace views do not retain themselves in the timeline.

At debug level, migration observations identify actual selection, resolution, player restoration, storage acknowledgement, source cleanup and rollback stages with a common `migrationId` and measured elapsed time. Source-cleanup failure remains a failure even after the destination is committed; failed rollback persistence/cleanup is labeled partial. Storage acknowledgement means the storage API resolved, not a new guarantee of disk durability. Stage records are single events; the final failover panel is not redrawn for every internal stage.

## Destinations and backpressure

```ts
import { Logger, JsonLogTransport, type LogTransport } from 'nyxlink';

const existingLogger: LogTransport = {
  write(record) {
    // Forward to an existing Pino/OTel/application sink here.
    // Never send a transport failure back into the same Logger.
  },
  async flush() {},
  async close() {},
};
const logger = new Logger({ profile: 'standard', mode: 'json',
  transports: [existingLogger, new JsonLogTransport(process.stdout)] });
logger.info('Node', 'connected');
await logger.flush();
await logger.close();
```

JSON stream writes wait for their write callback before the queue proceeds. The caller owns the stream; NyxLink does not end stdout or an injected Writable. Async/custom destinations must settle promptly and must not block the event loop synchronously. A timeout cannot cancel an arbitrary user Promise; quarantine prevents additional writes from accumulating on that destination. Other destinations continue.

When the queue is full, a new warning/error may replace a queued lower-priority record. Other saturated records are dropped. `getStats()` exposes accepted/written/dropped records, dropped critical records, transport errors, queued count, sampled events and grouped events. Delivery is best effort and bounded, not durable. Applications needing durable audit logs must supply a destination with that guarantee and monitor these counters. `onTransportError` receives a redacted failure; its own exceptions are isolated.

Grouping is bounded to 128 fingerprints and emits `log.repeated` summaries with the actual suppressed count on expiry, eviction or flush. Sampling/grouping are opt-in; warning/error records always bypass both. The timeline contains admitted records, including records that might subsequently be dropped by a saturated output queue; it is an observed event timeline, not a delivery receipt.

## Redaction and diagnostics

Known credential keys, tokens, sessions, cookies, raw `userData`, Bearer credentials and URL user/password fields are redacted before custom or built-in transports receive records. Serialization is bounded by depth, entries and string length, handles circular references/BigInt/error causes and does not invoke getters, custom inspectors or `toJSON`. It strips terminal control sequences. Arbitrary unlabeled secrets are not detectable; do not place them in messages or component names.

`diagnoseError(error, context)` and `logger.reportError(error, context)` return a typed diagnostic. Advice uses existing typed SDK codes or actual HTTP status; unknown failures explicitly remain unclassified. This is diagnostic advice, not automatic retry/recovery.

The private metrics server adds authenticated `GET /logging` and aggregate Prometheus counters when the manager owns a configured logger. It returns no messages, event history, guild IDs or credentials. See [private metrics](private-metrics.md).

## Optional terminal dashboard

```ts
import { TerminalDashboard } from 'nyxlink';
const dashboard = new TerminalDashboard(manager, logger, { intervalMs: 5000 });
const stop = dashboard.start();
const measured = dashboard.snapshot();
stop();
```

Construction does not start output or timers. An interactive TTY gets periodic snapshots; non-TTY/CI and `mode: 'static'` produce one snapshot per start. Start/stop are idempotent. It uses append-only log records, so logs/JSON do not conflict with terminal cursor redraws. This is a snapshot dashboard, not a full-screen live trace viewer.

Snapshots contain observed node state/stats with their age, source-health observations, real local queue/player counts, process heap/RSS/uptime and sampled event-loop utilization. Unknown telemetry stays absent; disconnected node/source telemetry is suppressed. Output node/source counts are bounded, with truncation counts disclosed. The caller must stop independently created dashboards; manager destruction or logger close also stops periodic rendering at the next tick.

## Lifecycle and verification

Manager shutdown closes its owned logger after detaching observers and cleaning backend resources. Independently created loggers remain application-owned. Closing a child does not close its parent's shared transports. Closing the root drains queued output, flushes and closes each distinct destination once, clears its timeline and disables correlation storage. Use `flush`/`close` before process termination when output matters.

See the compiled [observability example](../examples/observability.ts), `tests/structured-logging.test.cjs`, `tests/terminal-dashboard.test.cjs`, `tests/private-metrics.test.cjs`, and `pnpm run bench:logging`. The benchmark measures synthetic local logging; it does not certify playback performance, terminal rendering or a production soak.

No extra logging runtime dependency was added. Consola remains the facade; Pino, pino-pretty, Chalk and OpenTelemetry are not installed by the SDK. Existing application instances can be adapted through the transport contract.
