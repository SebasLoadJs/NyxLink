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
