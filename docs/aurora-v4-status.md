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
| TerminalCoordinator and bounded queues | Not implemented |
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
