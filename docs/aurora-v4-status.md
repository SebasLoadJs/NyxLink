# Aurora V4 — implementation status

This increment establishes the event contract before introducing terminal UI.
It is an expansion of the 5.3 master plan, not a completed terminal suite.

| Area | Status |
| --- | --- |
| Typed catalog, Pino route, filtering, allowlisted context, lifecycle | Implemented in this PR; CI pending |
| Failover correlation and measured duration | Implemented for observed start and final report |
| Optional trace correlation | Host context injection; no automatic active span propagation yet |
| Legacy API | Preserved; manager selects one logging route explicitly |
| JSON / pretty | Host Pino transport, verified by existing packed consumer test; Aurora event consumer check added |
| TerminalCoordinator and bounded queues | Initial single-line region, bounded queue and rejection accounting implemented; CI pending |
| Bootstrap, Event Stream, Music Strip, Incident Engine, Capability Explorer | Not implemented |
| Independent Ink Inspector and live snapshots | Not implemented |
| Optional visual dependencies and PTY demos | Not implemented |
| Expanded OTel instrumentation and SDK example | Not implemented |
| Benchmarks, compatibility matrix, release acceptance | Pending |

Privacy: only enumerated event codes, fixed messages, backend kind and numeric
counters are emitted. Raw debug messages, node identifiers, guild IDs, track
titles, URLs and backend errors are intentionally excluded. Trace IDs are
validated and supplied explicitly by the host. The host owns Pino and its
transport; this increment adds no new production dependency or global hooks.

Do not infer audio quality from protocol reports or claim the V4 requirements
are complete. No tags or npm publication are performed.

## Terminal coordination increment

`TerminalCoordinator` accepts a host-owned writable stream and an explicit
interactive flag. A single lease owns the dynamic line; accepted persistent
records clear and restore it. Pending records are limited by count and bytes,
and critical records can evict queued normal records. A queue containing only
critical records rejects additional records explicitly; use `onRejected` to
alert or forward via an independent destination. The current callback reports
reason and priority, not the original record. Guaranteed durable delivery is
not implemented. The coordinator never ends the host stream. An AbortSignal
can bound waiting for drain; this does not guarantee the last OS-level write
was physically displayed. No cursor is hidden. This increment strips caller
control sequences and uses an ASCII-only live line; themed multi-line rendering,
Unicode widths and Pino/Consola presentation integration are still pending.

## Visual foundation

`AuroraPresentation` and `examples/aurora-visual.mjs` provide a pure
banner/event renderer using Figlet, Gradient String, Chalk, Boxen, String
Width, Strip ANSI, Pretty MS and Log Symbols. These dependencies are installed
only in the explicit consumer; the core has no imports of them. The packed
consumer test installs pinned versions and tests 40/80/120-column banners,
ASCII fallback, duration formatting and privacy. The supported backend list
describes the client, not connected nodes. Failover describes automatic
movement (`autoMovePlayers`), not actual recovery or manual transfers.
No dynamic tasks, cursor effects, real Pino destination bridge or PTY
verification are claimed by this increment.

## Dynamic bootstrap increment

The explicit `AuroraBootstrap` observer distinguishes completion of
`manager.init()` (connections requested) from actual READY backend sessions.
Network observation uses a fixed set of registered node objects, a bounded
timeout, and optional cancellation. It neither delays nor changes normal
manager initialization unless the application explicitly awaits observation.

The optional host example `examples/aurora-bootstrap.mjs` wraps these two
operations in Listr2 silent tasks, obtains Ora frames without starting its
renderer, and directs CLI Progress to a private stream whose sanitized frames
are forwarded into a coordinator lease. No simultaneous terminal ownership.
Noninteractive mode prints only final phase summaries. Dependencies are pinned
in the isolated package consumer test. Actual PTY and full CI acceptance
remain pending; this is not a complete multi-stage bootstrap or a guarantee
of audible playback.

## Diagnostic models increment

`AuroraMusicStrip` observes a single explicitly selected player. Position
extrapolation is bounded to five seconds and marked estimated; streams have
no invented duration or percentage. The incident history accepts only common
failover event codes and bounded operation IDs, ignores duplicate terminal
reports while retained, and never claims audible recovery. The capability
explorer exposes session-local aliases and negotiated feature states, omitting
disconnected metrics rather than guessing them.

The host example provides CLI Table 3, Pretty Bytes, and an explicitly
standalone Log Update music renderer. The static consumer fixture verifies
units and non-TTY behavior; the interactive Log Update path still needs PTY
acceptance. Do not run that standalone view beside the coordinator. The
final coordinated visual pipeline, incident panels and Ink remain pending.

## Inspector increment

The bounded `AuroraInspectorStore` accepts common event records and
explicitly completed host-exported span metadata. Unknown span names and raw
attributes are excluded; an event with trace IDs alone is not a span.
`examples/aurora-inspector.mjs` implements five Ink views with Tab/arrows,
level/category/backend filters, local search, pause of view refresh, detail
and exit. No audio command is exposed. It is a standalone terminal owner
with console patching disabled and static fallback for non-TTY/CI/NO_COLOR.
Fixture tests render all five views through Ink itself. Real key input, PTY,
host exporter adapter and comprehensive trace tree remain to be validated.

## Advanced tracing increment
Active spans are used when supported by the host tracer. Search, loadtracks and player PATCH requests, queued explicit play/seek/stop, and executed failover attempts are instrumented. Resolved commands are not proof of audible playback. The host example forwards completed span metadata to the Inspector and supplies active trace IDs to Pino. Real async context manager, nested spans and Pino correlation have a packed consumer fixture. Node handshake, other REST routes, autoplay, crossfade, selection, session recovery, automatic Pino instrumentation, OTLP exporters and unified presentation remain pending. CI required.

## Unified pipeline and demo increment

The host-side `examples/aurora-pipeline.mjs` factory selects exactly one
terminal destination, uses Pino for canonical records, Pino Pretty for
pretty and detailed error output, Consola as a custom reporter in Aurora
mode, and the coordinator for all terminal writes. Silent and Custom
do not create a terminal owner. A second allowlist rejects arbitrary
raw payloads before rendering. SGR styling is explicitly enabled for
eligible TTY streams; other caller-supplied terminal controls are removed.

`examples/aurora-demo.mjs` runs simulated startup, music, failover, degraded,
recovery-failed and burst scenarios through the same event route. Install
the packed NyxLink package and the optional consumer dependencies from
`scripts/test-package.cjs` in a separate project, then copy the Aurora
example modules into that project. Commands:

```sh
node aurora-demo.mjs --scenario all --snapshot
node aurora-demo.mjs --format json --scenario startup --snapshot
node aurora-demo.mjs --scenario failover
node aurora-demo.mjs --inspector --format silent
```

Simulation labels are written to stderr for machine-readable JSON.
For Inspector, the demo snapshot explicitly identifies itself as simulated.
No credentials, Discord login, actual backend connections or playback are
needed. The isolated package consumer checks the JSON and failover scenarios.
Full PTY, snapshots captured from a real run, benchmark measurements, OTLP
and automatic Pino instrumentation remain pending.
