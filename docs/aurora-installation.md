# Aurora installation — NyxLink 5.3 development

The root SDK uses native Pino 10.4.0 loaded on demand. The optional runtime is shipped in the npm archive through ESM package subpaths. No old Manager logger configuration or automatic legacy subscription is supported. The visual dependencies are optional peers, so silent and core-only consumers need not load them.

Install the pinned runtime peers for the complete terminal, bootstrap and Inspector:

```sh
pnpm add pino-pretty@13.2.0 figlet@1.11.3 gradient-string@3.0.0 chalk@5.6.2 boxen@8.0.1 string-width@7.2.0 strip-ansi@7.1.2 pretty-ms@9.2.0 log-symbols@7.0.1 listr2@8.3.3 ora@8.2.0 cli-progress@3.12.0 cli-table3@0.6.5 pretty-bytes@6.1.1 log-update@6.1.0 ink@5.2.1 react@18.3.1 cli-truncate@4.0.0 wrap-ansi@9.0.0 slice-ansi@7.1.0 is-unicode-supported@2.1.0 figures@6.1.0 fuse.js@7.5.0 ink-text-input@6.0.0 ink-select-input@6.2.0 ink-spinner@5.0.0
```

Optional OpenTelemetry host SDK and OTLP integration:

```sh
pnpm add @opentelemetry/api@1.9.0 @opentelemetry/sdk-node@0.220.0 @opentelemetry/instrumentation-pino@0.55.1 @opentelemetry/sdk-trace-base@2.9.0 @opentelemetry/sdk-metrics@2.9.0 @opentelemetry/exporter-trace-otlp-http@0.220.0 @opentelemetry/exporter-metrics-otlp-http@0.220.0
```

| Entry | Responsibility |
| --- | --- |
| `nyxlink` | Client, canonical events, native Pino engine, silent default |
| `nyxlink/aurora` | Exclusive JSON / Pretty / Aurora / Custom / Silent pipeline |
| `nyxlink/aurora/bootstrap` | Real initialize and readiness observation |
| `nyxlink/aurora/diagnostics` | Tables and music strip |
| `nyxlink/aurora/inspector` | Independent interactive Ink UI |
| `nyxlink/aurora/otel` | Optional host correlation and inspector span processor |
| `nyxlink/aurora/sdk` | Explicit SDK initialization / shutdown; host owns provider |

CommonJS applications load the ESM UI with `await import('nyxlink/aurora')`. The public demo command is `pnpm exec nyxlink-aurora --scenario all --snapshot`; its inputs are simulated. Keep one owner of stdout. Stop the pipeline before opening a full-screen Inspector on that stream, or provide a separate stream. The library never starts an SDK, bot login, renderer or background monitor by import alone.

Acceptance: the packed-consumer test compiles and executes the installed subpaths. The generated lockfile and public API reference must match the final source SHA; no publication is implied by these instructions.

Terminal latency and readiness charts are rendered directly by Aurora. The former `@crafter/charts@0.2.5` peer was removed because its published ESM entrypoint failed native Node 22/24 packed-consumer imports. No consumer patch or special loader is required.

Inspector search prefers literal matches and falls back to Fuse.js fuzzy matching for queries of at least three characters. Search runs only over the sanitized read-only snapshot; existing severity/category/backend filters apply first. Escape returns to navigation.

## Advanced destinations and links

Install `ansi-escapes@7.3.0 terminal-link@3.0.0 supports-hyperlinks@2.3.0 ink-link@4.1.0 pino-abstract-transport@3.0.0` for Inspector documentation links and exclusive native file output. `nyxlink/aurora/file` provides `await createAuroraFilePipeline(path, {level:'info'})`; configure its target on Manager and await close after shutdown. Creates a new private file, refuses overwrite. The destination uses Pino's existing Sonic Boom implementation, not a separate log engine. Optional OTLP logging requires `@opentelemetry/api-logs@0.220.0 @opentelemetry/sdk-logs@0.220.0 @opentelemetry/exporter-logs-otlp-http@0.220.0`, explicit `createHostSDK({endpoint,exportLogs:true})`, and `onEvent:event=>sdk.emitAuroraEvent(event)` on the selected pipeline. Disabled by default. Never enable Pino automatic log sending; only normalized canonical events are exported. Tinybench is development-only.

File destination accepts `maxQueued` (1–10000, default 256); a saturated destination stops admission and rejects its close promise after draining accepted records. Cross-platform terminal acceptance uses Node PTY in the isolated `tests/pty` development project, never a NyxLink consumer runtime requirement. Run `npm ci --prefix tests/pty` then `node tests/pty/aurora-smoke.cjs` after building; Linux and Windows CI verify actual simulated PTY interactions. `nyxlink-aurora --help` exposes the fixed documentation link with a plain fallback.
