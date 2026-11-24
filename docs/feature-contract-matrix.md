# Matriz de contratos F01–F27 — NyxLink 5.3

Revisión: 24-11-2026. Rama de trabajo: `codex/resume-stabilization`; PR #32 hacia `dev`. Esta matriz recupera **el catálogo de 27 funcionalidades del Plan Maestro v1** y documenta los módulos reales observados en el repositorio. El inventario de las **38 tareas P0–P3** está separado en [master-plan-reconciliation.md](master-plan-reconciliation.md); los capítulos de modernización 0–23 están en [modernization-status.md](modernization-status.md).

**Regla de evidencia:** «Automatizado» indica que existen pruebas y workflows, *no* que pasaron en el HEAD final. Ninguna fila con LIVE, SOAK o RELEASE pendiente está aceptada contractualmente. El código descrito no garantiza acceso real a contenido, continuidad audible, ni éxito de Spotify/Deezer o plugins del servidor. F26/F27 son exclusiones **deliberadas**, no trabajos incompletos.

| ID | Contrato | Código existente | Pruebas automatizadas relacionadas | Guía / ejemplo | Puerta pendiente |
| --- | --- | --- | --- | --- | --- |
| `F01` | Logger configurable y privado | src/logging/Logger.ts; LogFormatter.ts | logger.test.cjs; diagnostic-redaction.test.cjs; structured-logging.test.cjs | logging-guide.md; observability.ts | Automatizado; LIVE-12 pendiente |
| `F02` | Lavalink v4 REST/WS | src/backends/LavalinkAdapter.ts; src/entities/Rest.ts | backends.test.cjs; tests/integration/backends.test.cjs | backend-compatibility.md; discordjs.ts | Laboratorios CI; LIVE-01/03 pendiente |
| `F03` | NodeLink y detección | src/backends/NodeLinkAdapter.ts; BackendDetector.ts | backend-features.test.cjs; nodelink-modern-contracts.test.cjs | backend-compatibility.md | Laboratorios CI; LIVE-02/04/08 pendiente |
| `F04` | Manager y lifecycle | src/core/Manager.ts; src/managers/ | manager-lifecycle.test.cjs; event-emitter-lifecycle.test.cjs | api-reference.md; discordjs.ts | Automatizado; aceptación SDK final pendiente |
| `F05` | Player y comandos | src/entities/Player.ts; src/players/ | player-commands.test.cjs; track-transitions.test.cjs | api-reference.md; discordjs.ts | Automatizado; comandos audibles LIVE-01/02 |
| `F06` | Queue, historial, loop | src/entities/Queue.ts; src/players/PlaybackAttempt.ts | queue-validation.test.cjs; player-retention.test.cjs | api-reference.md | Automatizado; stress real pendiente |
| `F07` | AutoPlay y preferencias | src/autoplay/AutoPlayManager.ts; RecommendationPreference.ts | autoplay.test.cjs; recommendation-fallback.test.cjs | api-reference.md | Automatizado; proveedor real LIVE-08 |
| `F08` | Resume y reconexión | src/nodes/SessionRecovery.ts; src/players/VoiceRecovery.ts | node-recovery-rest.test.cjs; voice-reconnect-timers.test.cjs | phase-5-playback-recovery.md | Automatizado; LIVE-03/04 |
| `F09` | Selección por salud/región/carga | src/nodes/NodeSelector.ts; NodeScoring.ts | node-selection.test.cjs; source-aware-selection.test.cjs | node-selection.md; node-selection.ts | Automatizado; LIVE-11 |
| `F10` | Migración/failover | src/players/PlayerMigration.ts; src/nodes/NodeFailover.ts | player-migration-regression.test.cjs; migration-rollback.test.cjs | phase-5-playback-recovery.md | Automatizado; LIVE-06 |
| `F11` | Capacidades tipadas | src/backends/CapabilityRegistry.ts; BackendInventory.ts | capability-registry.test.cjs; backend-features.test.cjs | backend-compatibility.md | Automatizado; versiones futuras no certificadas |
| `F12` | Filtros por backend | src/entities/Filters.ts; src/backends/BackendAdapter.ts | filter-protocol.test.cjs; backend-features.test.cjs | api-reference.md | Automatizado; audibilidad LIVE-01/02 |
| `F13` | Spotify/Deezer metadata | src/sources/spotify.ts; src/sources/deezer.ts | search.test.cjs; recommendation-fallback.test.cjs | api-reference.md | Sin proveedor real certificado; LIVE-08 |
| `F14` | Resolver de fuente inyectado | src/search/SearchService.ts | search.test.cjs; provider-http-boundaries.test.cjs | api-reference.md | Automatizado; responsabilidad del integrador |
| `F15` | Letras/chapters/sponsorblock | src/backends/NodeLinkContracts.ts; LavaLyricsContracts.ts | nodelink-modern-contracts.test.cjs; lavalyrics-plugin.test.cjs | phase-3-nodelink.md | Contratos CI; LIVE-08 |
| `F16` | Mixer y capas | src/backends/NodeLinkMixContracts.ts; src/entities/Player.ts | mix-lifecycle.test.cjs; nodelink-modern-contracts.test.cjs | mixer.md | Automatizado; mezcla audible LIVE-07 |
| `F17` | VoiceReceiver opcional | src/entities/VoiceReceiver.ts | voice-receiver-lifecycle.test.cjs | phase-3-nodelink.md | Opt-in; permisos/consentimiento LIVE-10 |
| `F18` | Streams NodeLink opcionales | src/backends/NodeLinkStreamResponse.ts; src/entities/Node.ts | nodelink-stream-format.test.cjs; stream-errors.test.cjs | backend-compatibility.md | Automatizado; fuente real LIVE-08 |
| `F19` | LiveChat NodeLink opcional | src/entities/YouTubeLiveChat.ts | youtube-livechat-lifecycle.test.cjs | phase-3-nodelink.md | Opt-in; proveedor/permisos LIVE-10 |
| `F20` | Eventos/observabilidad estructurada | src/logging/StructuredLog.ts; src/observability/PerformanceMonitor.ts | structured-logging.test.cjs; performance-monitor.test.cjs | logging-guide.md; observability.ts | Automatizado; LIVE-12 y soak |
| `F21` | Cache TTL y deduplicación | src/search/SearchService.ts; SharedSearchRequests.ts | search.test.cjs; shared-search-requests.test.cjs | api-reference.md | Automatizado; pruebas proveedor real pendientes |
| `F22` | Storage pluggable/Redis | src/database/StorageAdapter.ts; RedisStorage.ts; src/cluster/RedisGuildIpcRouter.ts | storage-adapter.test.cjs; redis-guild-ipc.test.cjs; tests/integration/redis-guild-ipc.test.cjs | redis-storage.md | CI Redis; LIVE-09 |
| `F23` | Ejemplos/guías/API | docs/api-generated.md; docs/api-reference.md; examples/ | tests/types/public-api.ts; scripts/test-package.cjs | api-reference.md; migrating-from-moonlink.md | Consumidor CI; revisión final al release |
| `F24` | Pruebas/CI/seguridad | tests/; .github/workflows/ | scripts/test-backends.cjs; scripts/endurance.cjs | release-5.3-plan.md | Requiere HEAD final y soak SOAK-01/02 |
| `F25` | Métricas HTTP privadas opt-in | src/observability/PrivateMetricsServer.ts | private-metrics.test.cjs; performance-monitor.test.cjs | private-metrics.md; observability.ts | Automatizado; LIVE-12 |
| `F26` | @discordjs/voice interno | No se implementa por decisión de alcance | Tests de conectores/gateway externos | master-plan-reconciliation.md | Fuera de alcance; mantener límite |
| `F27` | Backend distinto de Lavalink/NodeLink | No se implementa por decisión de alcance | Tests de admisión de backends | backend-compatibility.md | Fuera de alcance; no inventar soporte |

## Registro mínimo de aceptación por funcionalidad

Para aprobar cualquier fila se necesita: requisito inequívoco, implementación contrastada, prueba unitaria/regresión, tipos públicos si procede, ejemplo de consumidor si existe exposición, documentación del comportamiento y una comprobación real del backend cuando la función depende de audio/Discord/proveedores.

**Requisitos de verificación automáticos:** (1) TypeScript estricto Node 22/24; (2) suite completa, cobertura y contratos; (3) tarball CJS/ESM de consumidor aislado; (4) Lavalink baseline/plugins y NodeLink baseline/moderno; (5) integración Redis/leases/IPC; (6) CodeQL, secret scan y auditoría de dependencias; (7) endurance de protocolo >=600 s, todo en el **mismo SHA final**. Los checks verdes de revisiones anteriores son evidencia histórica, no reemplazo.

**Responsable de las pruebas no automatizables:** operador del bot. Ejecutar LIVE-01–LIVE-12 (audio, comandos, reconexión, crossfade, mixer, proveedor real, transferencias, voz recibida y logs reales) y SOAK-02 con voz autorizada; ejecutar SOAK-01 en host de prueba con contenedores. Véase [pending-real-world-acceptance.md](pending-real-world-acceptance.md). La comprobación humana de audibilidad no puede aprobarse desde CI.

**Publicación aún separada:** RELEASE-01 (atribución OSL/activos), RELEASE-02 (acceso y versión npm) y RELEASE-03 (autorizaciones por RC y estable). Orden acordado: cerrar código y gates → fusionar PRs en `dev` con revisión → candidata inmutable `5.3.0-rc.1`/npm `next` → aceptación externa → `v5.3` y `5.3.0`/npm `latest` → propuesta y autorización de eliminación de ramas obsoletas. Mantener `dev`, `v5.2`, versiones soportadas y ramas con trabajos no fusionados.

## Auditorías técnicas pendientes de cierre

- Consolidar ampliaciones A–J con evidencias concretas de tests, tipos y ejemplos; no darlas por terminadas a partir de una tabla.
- Revisar la implementación en CI del último HEAD, especialmente búsqueda/fallback, auditoría de dependencias, transportes observabilidad y NodeLink moderno.
- Cumplir los controles de seguridad, atribución, derechos de distribución, seguridad operacional del receptor de voz y los criterios LIVE/SOAK sin inventar resultados.

La mera existencia de un módulo **no significa** que se hayan completado todas sus condiciones de uso, de seguridad o de calidad.
