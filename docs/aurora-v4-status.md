# Aurora V4 — implementation status

Aurora V4 expands the 5.3 master plan. This table distinguishes merged
baseline evidence from changes awaiting final acceptance.

| Area | Status |
| --- | --- |
| Typed event catalog, Pino routing, privacy and lifecycle | CI verified in #37 |
| TerminalCoordinator and queue limits | CI verified in #38; real Linux PTY in #44 |
| Visual presentation and optional dependencies | CI verified in #39 |
| Bootstrap, Music Strip, Incident Engine, Capability Explorer, Ink Inspector | CI verified in #42; initial models, not full live-audio acceptance |
| Silent / JSON / Pretty / Aurora / Custom and host SDK / OTLP | CI verified in #43 |
| Real PTY captures and comparative synthetic benchmark | CI verified in #44 |
| Additional operation tracing and Inspector demo event routing | This PR; CI pending |
| Complete REST/handshake coverage, detailed visual requirements, live audio and release acceptance | Not fully accepted |

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

## Host SDK and OTLP increment

`examples/aurora-sdk.cjs` demonstrates host-owned registration of NodeSDK
before loading Pino. Choose either explicit Aurora `traceContext` or automatic
Pino correlation (not both). Automatic Pino log sending is disabled so the
existing destination remains the sole log route. OTLP HTTP trace and metric
exporters are enabled only with an explicitly supplied base endpoint. The
host owns SDK start/shutdown. No default remote export or global registration
occurs in the NyxLink library. The integration fixture uses a loopback HTTP
receiver and checks actual nonempty trace/metric requests and one Pino
record. CI must verify the pinned versions, including Pino 10 support.

## Terminal acceptance and benchmark increment

The packed consumer now runs six Linux pseudo-terminal sessions, captures
actual ANSI streams at 40/80/120 columns, checks NO_COLOR, persistent log
clear/restore and Ink keyboard navigation. These are execution transcripts
of simulated inputs, not recordings of a live music session. The benchmark
compares disabled, silent, JSON, Pretty and Aurora with 2,000 events and
three repeats each. It checks exact delivery counts and records elapsed
time, throughput and output bytes without imposing a hardware-specific
throughput threshold. GitHub Actions uploads the transcripts and JSON
measurements per Node version even on failure. Consola repeat throttling
is disabled on the canonical event route to avoid collapsing events.
CI results are still required; no benchmark numbers are assumed.

## Remaining operation coverage

Adds spans for connection setup (not READY confirmation), synchronous node
selection, cross-backend track resolution, session restoration attempts,
autoplay playback and crossfade configuration requests. Reconnection,
session resumed and crossfade/gapless transition reports use real events;
configuration is not evidence of audible transition. Runtime operation
names and classification labels are allowlisted even for JavaScript callers.
Some REST endpoints and complete handshake timing are not instrumented.
CI, PTY and live-audio acceptance are required.

## Verified acceptance baseline (PR #44)

Commit `37e10fe5f9766a4874ef87b9bcd8ff03cace2b1c`; [GitHub Actions run 45459627521](https://github.com/SebasLoadJs/NyxLink/actions/runs/45459627521).
Both package validation jobs passed. Six PTY sessions were captured for each
Node version. The following are measured medians from the corresponding
benchmark.json files, three repetitions of 2,000 synthetic queue events per mode.

| Mode | Node 22.23.5 events/s | Node 24.22.3 events/s |
| --- | ---: | ---: |
| JSON | 90,542 | 80,005 |
| Pretty | 53,764 | 29,887 |
| Aurora | 39,666 | 38,459 |

Each active mode rendered all 6,000 events per runtime, with zero rejected
records. No throughput threshold or claim about real backend performance is
inferred. The destination is a synthetic synchronous Writable, not Discord,
a network transport, or a terminal rendering benchmark under real load.
CI artifact IDs 14952985134 (Node 22) and 14952795737 (Node 24) expire on
2026-12-08. Final candidate evidence must be collected again on its own SHA.

The Inspector demo now routes events to a custom read-only store without
another stdout renderer. The expanded PTY fixture exercises all five tabs;
those additional checks remain pending for the new commit.

## Acceptance hardening

The merged #45 baseline passed all seven workflows. The next increment
addresses credential leakage in legacy boxes and quoted values, disables
custom inspection hooks in legacy formatting, and adds optional SDK
observable gauges (connected nodes and locally playing, unpaused players).
Gauges are collected by the host, not timers in the library; callbacks are
removed on close. A new capability negotiation span wraps the existing
coalesced metadata request. Counts are not audio audibility measurements.
Legacy text redaction remains best effort: arbitrary prose without known
credential keys cannot be guaranteed safe. Prefer Aurora's fixed schema.

## REST and handshake timing

The remaining Rest transport calls now use the same operation instrument
as loadtracks and player PATCH without adding nested duplicate spans to
those existing paths. HTTP streaming spans end when response headers arrive,
not when audio is consumed. Transport resolution is not proof of schema
validation or playback. Lifecycle handshake spans measure CONNECTING
through READY, DISCONNECTED, DESTROYED or observer shutdown, including any
scheduled reconnect delay represented by CONNECTING. They are separate
from the connection setup span and never include credentials or endpoints.
No additional timers or global hooks. Integration/regression tests and CI
are required for this increment.

## Terminal ownership and cancellation hardening

The coordinator now rejects a second owner of the same stream, automatically
redraws an active ASCII region on resize, and shares the first close result
among concurrent callers. It guards rejection callbacks against reentrant
queue growth. An optional independent critical-record fallback receives
sanitized terminal text when a queued critical event is rejected or evicted
by shutdown; callers must not point it back at the coordinator. Delivery of
bytes already accepted by the OS/stream cannot be guaranteed. Without a
fallback, loss remains explicitly counted. Regression tests cover width
changes, owner release, saturation, cancellation and callback reentrancy.

## Coordinated music and incident presentation

The explicit host API `pipeline.startMusic(strip, {signal})` acquires the
coordinator's existing region, updates at a bounded cadence and releases
on cancellation, rendering failure or pipeline shutdown. It neither starts
playback nor owns the selected-player observer. A noninteractive Aurora
destination receives a single static snapshot; other logging modes do not
start a music view. A second region is never created when the bootstrap
or another view already owns the lease. The standalone Log Update view
remains a mutually exclusive alternative. Incident summaries preserve the
observed source backend from the start record and suppress retained
duplicate terminal reports. They do not claim known causes or audible
recovery when those signals are absent. Tests and CI remain required.

## Dependency evidence matrix (baseline and pending acceptance)

Versions are the isolated consumer pins in `scripts/test-package.cjs`. The
packed package itself still requires only Consola. The latest approved
baseline is #46; changes in #47–48 must be validated again.

| Package | Executed integration | Consumer fixture |
| --- | --- | --- |
| pino 10.4.0 | Canonical record and destination | aurora-pipeline-consumer.mjs |
| pino-pretty 13.2.0 | Pretty and detailed records | aurora-pipeline-consumer.mjs |
| consola 3.4.2 | Reporter bridge | aurora-pipeline-consumer.mjs |
| figlet 1.9.4 | Wordmark | aurora-visual-consumer.mjs |
| gradient-string 3.0.0 | Wordmark/divider | aurora-visual-consumer.mjs |
| chalk 5.6.2 | Semantic coloring | aurora-visual-consumer.mjs, aurora-pty.py |
| boxen 8.0.1 | Banner/incident panels | aurora-visual-consumer.mjs, aurora-pty.py |
| string-width 7.2.0 | Width measurement | aurora-visual-consumer.mjs |
| strip-ansi 7.1.2 | Plain snapshots | aurora-visual-consumer.mjs |
| pretty-ms 9.2.0 | Durations | aurora-diagnostics-consumer.mjs |
| log-symbols 7.0.1 | Semantic markers | aurora-visual-consumer.mjs |
| listr2 8.3.3 | Bootstrap task sequencing | aurora-bootstrap-consumer.mjs |
| ora 8.2.0 | Indeterminate bootstrap frame | aurora-bootstrap-consumer.mjs |
| cli-progress 3.12.0 | Known readiness total | aurora-bootstrap-consumer.mjs |
| cli-table3 0.6.5 | Capability table | aurora-diagnostics-consumer.mjs |
| pretty-bytes 6.1.1 | Memory sizes | aurora-diagnostics-consumer.mjs |
| log-update 6.1.0 | Standalone live music renderer | aurora-diagnostics-consumer.mjs (static fallback; interactive path still needs PTY) |
| ink 5.2.1 / react 18.3.1 | Standalone inspector | aurora-inspector-consumer.mjs, aurora-pty.py |
| @opentelemetry/api 1.9.0 | Active context | aurora-otel-consumer.mjs |
| SDK trace/metrics/context 2.2.0 | Nested spans, metrics and lifecycle | observability-consumer.cts, aurora-otel-consumer.mjs |
| SDK Node / OTLP exporters 0.208.0 | Explicit host export to loopback receiver | aurora-sdk-consumer.cjs |
| instrumentation-pino 0.55.1 | Automatic log correlation | aurora-sdk-consumer.cjs |

Not all extended use cases in the original V4 brief have been implemented.
In particular, richer incident phases, timed trace trees, per-node progress,
a local inspector report export, bounded latency history and all requested
PTY modes still require acceptance. No new functionality is inferred from
a dependency merely being installed.

## Inspector reports, timestamps and bounded latency samples

The host exporter forwards actual span start timestamps. The Inspector
shows a bounded parent/child tree with relative start offsets, measured
duration and missing-parent markers; it never creates synthetic spans.
A host-configured reportPath enables the explicit e key to export the
trusted read-only store to a new local JSON file (exclusive create, mode
0600 on POSIX). There is no automatic network upload or overwrite.
Latency samples are taken at host request, retained up to 60 per node
and capacity-limited across nodes; absent readings are not synthesized.
The view samples while active and stops refreshing when paused.
New tests require CI acceptance. Report exports assume the supplied
source is the sanitized Inspector store, not arbitrary user objects.
