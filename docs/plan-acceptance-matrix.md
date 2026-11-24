# Matriz de cierre del plan unificado

Fuente: documento del propietario NYXLINK_TODO_EN_UNO_PARA_IA.md, sección 6 (A–J), catálogo F01–F27, backlog de 38 IDs y anexo de modernización 0–23; Aurora V4 y aclaraciones posteriores sustituyen el logger anterior. Esta auditoría es de trazabilidad estática de archivos reales en el repositorio, no una prueba de cada condición de aceptación.

## Catálogo y backlog

[27 contratos](feature-contract-matrix.md) · [38 tareas](master-plan-reconciliation.md) · [24 capítulos](modernization-status.md). Las dos exclusiones expresas F26/F27 se mantienen. Para tipos públicos, consultar [referencia generada](api-generated.md) y `tests/types/public-api.ts`. Para ejemplos de consumidor instalado, `scripts/test-package.cjs`. Para cambios de versión, `CHANGELOG.md`.

| Área | Alcance original | F | Backlog relacionado | Código/integración | Pruebas relacionadas | Docs y ejemplos | Criterios externos o límites |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | Core y arquitectura | F04 F05 F06 F08 F10 F23 | P0-004 P1-013 P3-038 | `src/core/Manager.ts`; `src/players/PlaybackGuard.ts`; `src/players/PlayerCommandQueue.ts`; `src/players/PlayerMigration.ts`; `src/nodes/SessionRecovery.ts` | `tests/player-commands.test.cjs`; `tests/player-migration-regression.test.cjs`; `tests/recovery-listener-cancellation.test.cjs`; `tests/types/public-api.ts` | `docs/implementation-closure.md`; `docs/api-reference.md` | CI; auditoría incremental, no certificación de ausencia de defectos |
| B | Multi-backend | F02 F03 F11 F12 F24 F26 F27 | P1-010 P1-011 P1-020 P1-021 | `src/backends/LavalinkAdapter.ts`; `src/backends/NodeLinkAdapter.ts`; `src/backends/CapabilityRegistry.ts`; `src/backends/BackendInventory.ts` | `tests/backends.test.cjs`; `tests/protocol-validation.test.cjs`; `tests/integration/backends.test.cjs`; `tests/backend-features.test.cjs` | `docs/backend-compatibility.md`; `examples/discordjs.ts` | LIVE-01/02/03/04; solo dos familias |
| C | Motor musical | F05 F06 F07 F12 F13 F14 F16 | P1-012 P1-013 P1-014 P2-022 P2-026 | `src/entities/Player.ts`; `src/entities/Queue.ts`; `src/autoplay/AutoPlayManager.ts`; `src/autoplay/RecommendationPreference.ts`; `src/players/QueuePreload.ts`; `src/tracks/MetadataTrackResolver.ts`; `src/search/SearchService.ts`; `src/sources/spotify.ts`; `src/sources/deezer.ts` | `tests/autoplay.test.cjs`; `tests/queue-preload.test.cjs`; `tests/mix-lifecycle.test.cjs`; `tests/track-resolution.test.cjs`; `tests/metadata-fallback-deadline.test.cjs`; `tests/search.test.cjs` | `docs/mixer.md`; `docs/phase-3-nodelink.md` | LIVE-01/02/05/07/08; DSP/AutoMix interno es upstream |
| D | NodeLink moderno y privacidad | F03 F15 F16 F17 F18 F19 | P1-021 P2-023 P2-024 P2-025 P3-034 P3-035 | `src/backends/NodeLinkContracts.ts`; `src/backends/NodeLinkMixContracts.ts`; `src/backends/NodeLinkStreamResponse.ts`; `src/nodes/SourceHealthMonitor.ts`; `src/entities/VoiceReceiver.ts`; `src/entities/YouTubeLiveChat.ts` | `tests/source-health-events.test.cjs`; `tests/voice-receiver-lifecycle.test.cjs`; `tests/nodelink-stream-format.test.cjs`; `tests/nodelink-modern-contracts.test.cjs`; `tests/youtube-livechat-lifecycle.test.cjs` | `docs/phase-3-nodelink.md`; `docs/backend-compatibility.md` | LIVE-08/10; workers, HTTP/2/HLS y DSP del servidor |
| E | Lavalink y plugins | F02 F11 F15 | P1-010 P1-019 P2-023 | `src/backends/LavaLyricsContracts.ts`; `src/backends/LavalinkSponsorBlockContracts.ts`; `src/backends/LavalinkAdapter.ts` | `tests/lavalyrics-plugin.test.cjs`; `tests/lavalink-sponsorblock.test.cjs`; `scripts/test-lavalink-plugins.cjs` | `docs/phase-4-lavalink.md`; `docs/backend-compatibility.md` | LIVE-08; proveedores reales y plugins no certificados fuera de matriz |
| F | Resiliencia y selección | F08 F09 F10 F21 | P1-015 P1-016 P1-017 P2-027 | `src/nodes/NodeSelector.ts`; `src/nodes/NodeFailover.ts`; `src/nodes/NodeCircuitBreaker.ts`; `src/nodes/SessionRecovery.ts`; `src/players/VoiceRecovery.ts`; `src/players/PlayerMigration.ts`; `src/search/SharedSearchRequests.ts` | `tests/node-selection.test.cjs`; `tests/node-recovery-rest.test.cjs`; `tests/node-disconnect-recovery.test.cjs`; `tests/migration-rollback.test.cjs`; `tests/voice-close-recovery-fencing.test.cjs` | `docs/node-selection.md`; `examples/node-selection.ts`; `docs/phase-5-playback-recovery.md` | LIVE-06/11; continuidad audible no demostrada |
| G | Aurora y observabilidad | F01 F20 F25 | P0-001 P0-006 P1-018 P3-037 | `src/logging/AuroraEvents.ts`; `src/logging/PinoEngine.ts`; `src/logging/AuroraInspector.ts`; `src/logging/AuroraDiagnostics.ts`; `src/logging/TerminalCoordinator.ts`; `src/logging/SafeDiagnostics.ts`; `src/logging/ObservedFields.ts`; `src/observability/TerminalDashboard.ts`; `src/observability/OpenTelemetry.ts` | `tests/aurora-events.test.cjs`; `tests/aurora-inspector.test.cjs`; `tests/structured-logging.test.cjs`; `tests/terminal-dashboard.test.cjs`; `tests/fixtures/aurora-pipeline-consumer.mjs`; `tests/fixtures/aurora-sdk-consumer.cjs`; `tests/fixtures/aurora-file-consumer.mjs` | `docs/logging-guide.md`; `docs/aurora-installation.md`; `examples/aurora-pipeline.mjs`; `examples/aurora-inspector.mjs` | LIVE-12; V4 y decisión de sustitución reemplazan API/perfiles legacy |
| H | Redis, IPC y métricas | F22 F25 | P3-036 P3-037 | `src/database/RedisStorage.ts`; `src/database/RedisGuildLeaseCoordinator.ts`; `src/cluster/GuildOwnership.ts`; `src/cluster/RedisGuildIpcRouter.ts`; `src/observability/PrivateMetricsServer.ts` | `tests/integration/redis-storage.test.cjs`; `tests/integration/redis-guild-ipc.test.cjs`; `tests/private-metrics.test.cjs`; `tests/redis-guild-ipc.test.cjs` | `docs/redis-storage.md`; `docs/private-metrics.md`; `examples/observability.ts` | LIVE-09/12 y gateway autenticado por host |
| I | Calidad y seguridad | F24 | P0-001 P0-002 P0-004 P0-005 P0-006 P0-008 P0-009 P2-032 | `src/observability/PerformanceMonitor.ts`; `scripts/endurance-worker.cjs`; `scripts/endurance-statistics.cjs`; `scripts/check-endurance-evidence.cjs`; `scripts/test-soak.cjs` | `tests/performance-monitor.test.cjs`; `tests/endurance-statistics.test.cjs`; `tests/endurance-evidence.test.cjs`; `tests/diagnostic-redaction.test.cjs`; `tests/soak-options.test.cjs`; `.github/workflows/pr.yml`; `.github/workflows/stabilization-endurance.yml` | `docs/release-5.3-plan.md`; `docs/pending-real-world-acceptance.md` | SOAK-01/02, CI del HEAD; no certificar leak-free |
| J | DX, migración y release | F23 F24 | P0-003 P0-007 P0-008 P2-028 P2-029 P2-030 P2-031 P2-033 | `index.ts`; `package.json`; `NOTICE.md`; `LICENSE`; `scripts/check-package.cjs`; `scripts/release-policy.cjs` | `tests/types/public-api.ts`; `scripts/test-package.cjs`; `tests/release-workflow-gates.test.cjs` | `README.md`; `CHANGELOG.md`; `docs/migrating-from-moonlink.md`; `docs/release-5.3-rc-runbook.md`; `docs/license-attribution-review.md`; `examples/discordjs.cjs` | RELEASE-01/02/03; no publicación |

## Relación de capítulos 0–23

| Capítulo | Áreas de implementación y aceptación |
| --- | --- |
| 0 | J |
| 1 | A |
| 2 | A |
| 3 | B |
| 4 | F |
| 5 | C |
| 6 | D |
| 7 | G |
| 8 | G |
| 9 | G |
| 10 | G |
| 11 | G |
| 12 | G |
| 13 | G |
| 14 | G |
| 15 | G |
| 16 | I G |
| 17 | I G |
| 18 | A J |
| 19 | H |
| 20 | I |
| 21 | J |
| 22 | A I |
| 23 | I J |

## Decisiones de alcance y deuda

- Aurora V4 y la aclaración del propietario sustituyen el logger standalone, adaptadores, mensajes de aplicación arbitrarios y layouts legacy: no hay una segunda API de logging. El Inspector usa correlaciones y datos anonimizados; no mantiene la antigua búsqueda de registros por guild sin procesar. El host controla su logger de aplicación, sampling/dedup y sinks externos.
- El SDK no implementa un motor de audio, DSP, HTTP/2, HLS, workers ni catálogo musical de servidor. Se valida su contrato observable con revisiones fijadas, no se afirma soporte universal de extensiones o fuentes.
- El CI histórico de 9d4ba78 no certifica los commits posteriores de medición y trazabilidad. Verificar el último SHA desde GitHub Actions. El estado de todas las filas es implementado con referencias revisadas o excluido por decisión; no es Done contractual.
- SOAK-01 sigue sin resultado de 24–72 h; LIVE-01–12 y SOAK-02 requieren evidencia operativa correspondiente; RELEASE-01–03 exigen titularidad/atribución y autorización. No existe publicación implícita.

El test `tests/plan-acceptance-matrix.test.cjs` verifica integridad de IDs y referencias. Un resultado verde de este test demuestra consistencia del inventario, no cobertura semántica integral ni aceptación externa.
