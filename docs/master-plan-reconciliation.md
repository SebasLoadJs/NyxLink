# NyxLink — reconciliación del plan original (38 tareas) con el código actual

Fecha de revisión: **23 de noviembre de 2026**. Rama: `dev` (no `v5.2`).

## Procedencia y reglas

Este inventario restaura los IDs de `NyxLink-Plan-Maestro-v1/08-ROADMAP/BACKLOG.csv` (plan del 1 de noviembre). Las fases **0–5 aquí son las del plan original**. No deben confundirse con los documentos técnicos `docs/phase-1-audit.md` a `docs/phase-5-playback-recovery.md`, que describen incrementos posteriores con numeración distinta.

Leyenda: **CI verificado** significa que existía evidencia de ejecución automatizada satisfactoria en `dev` anterior al último cambio, no aceptación de voz audible; **Implementado** significa que hay código/documentación, pero el criterio de aceptación completo no está probado; **Pendiente** requiere trabajo de implementación o publicación. No se declara ninguna tarea como *Done* contractual hasta completar código + pruebas + tipos + ejemplo + documentación + changelog y evidencia por backend.

Referencia inicial CI: commit `2e2bc6bbfd1db20841cf658367c2c4956cc7915d` — [validación Node 22/24](https://github.com/SebasLoadJs/NyxLink/actions/runs/45104859133), [Lavalink/NodeLink](https://github.com/SebasLoadJs/NyxLink/actions/runs/45104859183), [endurance extendida](https://github.com/SebasLoadJs/NyxLink/actions/runs/45104859114), [CodeQL](https://github.com/SebasLoadJs/NyxLink/actions/runs/45104859127). Esas ejecuciones **no certifican commits posteriores**.

## Matriz de los 38 trabajos

| ID | Fase | Trabajo original | Estado de evidencia | Implementación / tests relevantes | Falta para cerrar |
| --- | --- | --- | --- | --- | --- |
| P0-001 | 0 (P0) | Sanitizar secretos en Node | Evidencia automatizada | `src/logging/LogFormatter.ts`, `tests/diagnostic-redaction.test.cjs` | Verificar trazas de sesiones en pruebas reales |
| P0-002 | 0 (P0) | Sanitizar gateway de voz | Evidencia automatizada | `src/entities/VoicePacketHandler.ts`, `tests/voice-gateway.test.cjs` | Inspeccionar logs de sesión Discord real |
| P0-003 | 0 (P0) | Desactivar publicación heredada | Implementado | `.github/workflows/npm-publish.yml` | Revisar permisos del release final |
| P0-004 | 0 (P0) | Lockfile y CI reproducible | CI verificado | `pnpm-lock.yaml`, `.github/workflows/pr.yml` | Repetir en el SHA de la candidata |
| P0-005 | 0 (P0) | Runner unitario node:test | CI verificado | `package.json`, `tests/*.test.cjs` | Mantener cobertura regresiva |
| P0-006 | 0 (P0) | Prueba canaria de secretos | CI verificado | `tests/diagnostic-redaction.test.cjs`, `tests/logger.test.cjs` | Añadir evidencia de logs en ejecución Discord |
| P0-007 | 0 (P0) | Rebranding package/README | Implementado | `package.json`, `README.md`, `LICENSE` | Auditar cada mención pública del fork |
| P0-008 | 0 (P0) | Build TS y pack seco | CI verificado | `scripts/test-package.cjs`, `scripts/check-package.cjs` | Revalidar candidata inmutable |
| P0-009 | 0 (P0) | CodeQL en ramas actuales | CI verificado | `.github/workflows/codeql.yml` | Verificar alertas abiertas además del job |
| P1-010 | 1 (P1) | Contratos y errores REST/WS | CI verificado | `src/backends/ProtocolContracts.ts`, `tests/protocol-contracts.test.cjs` | Auditar extensiones con payloads opcionales |
| P1-011 | 1 (P1) | WS ready/stats/events | CI verificado | `src/entities/Node.ts`, `tests/node-lifecycle.test.cjs` | Prueba de voz Discord real |
| P1-012 | 1 (P1) | REST play/pause/seek | CI verificado | `src/entities/Player.ts`, `tests/player-commands.test.cjs` | Medir precisión de seek real |
| P1-013 | 1 (P1) | Comandos serializados | CI verificado | `src/players/PlayerCommandQueue.ts`, `tests/player-commands.test.cjs` | Estrés concurrente con servidor real |
| P1-014 | 1 (P1) | Cola/loop/skip/autoplay | CI verificado | `src/autoplay/AutoPlayManager.ts`, `tests/autoplay.test.cjs` | Evaluar recomendaciones reales y handoff audible |
| P1-015 | 1 (P1) | Health y selección de nodos | CI verificado | `src/nodes/NodeSelector.ts`, `tests/node-selection.test.cjs` | Medir selección bajo carga real |
| P1-016 | 1 (P1) | Resume 404 y reconexión WS | CI verificado | `src/nodes/SessionRecovery.ts`, `tests/node-recovery-rest.test.cjs` | Confirmar recuperación de voz |
| P1-017 | 1 (P1) | Failover y transferNode | CI verificado | `src/nodes/NodeFailover.ts`, `tests/player-migration-regression.test.cjs` | Confirmar continuidad audible y fallo en vivo |
| P1-018 | 1 (P1) | Logging/eventos estructurados | Implementado parcialmente | `src/logging/Logger.ts`, `tests/logger.test.cjs` | Cerrar revisión de observabilidad y seguridad de sinks |
| P1-019 | 1 (P1) | Staging Lavalink con audio real | Harness de comandos y reconexión para Lavalink/NodeLink y crossfade NodeLink implementado; aceptación audible manual pendiente | `scripts/test-live-voice.cjs`, `scripts/live-voice-commands.cjs`, `tests/live-voice-safety.test.cjs`, `tests/live-voice-commands.test.cjs`, `docs/live-voice-verification.md` | Ejecutar los tres modos autorizados, certificar audio, seek, crossfade, voz recuperada y fallos reales de nodo/partición |
| P1-020 | 2 (P1) | Detección NodeLink/capabilities | CI verificado | `src/backends/BackendDetector.ts`, `tests/backend-features.test.cjs` | Fijar matriz por versión del servidor |
| P1-021 | 2 (P1) | REST/WS NodeLink y errores | CI verificado | `scripts/test-nodelink-modern.cjs`, `tests/nodelink-modern-contracts.test.cjs` | Probar audio real de NodeLink actualizado |
| P2-022 | 2 (P2) | Mixer y lifecycle | Implementado parcialmente | `src/backends/NodeLinkOrchestration.ts`, `tests/nodelink-orchestration.test.cjs` | Mezcla audible, cleanup, error y concurrencia |
| P2-023 | 2 (P2) | Lyrics y chapters tipados | CI verificado | `src/backends/NodeLinkContracts.ts`, `tests/nodelink-modern-contracts.test.cjs` | Proveedores reales, idiomas y ausencias |
| P2-024 | 2 (P2) | Direct stream opcional | CI verificado | `src/backends/NodeLinkStreamResponse.ts`, `tests/nodelink-stream-format.test.cjs` | Verificar proveedor autorizado y límites reales |
| P2-025 | 2 (P2) | Eventos extendidos NodeLink | CI verificado | `src/nodes/SourceHealthMonitor.ts`, `tests/source-health-events.test.cjs` | Inventario de eventos según versión exacta |
| P2-026 | 3 (P2) | Resolver search y fuentes | CI verificado | `src/search/SearchService.ts`, `tests/search.test.cjs` | Recomendaciones reales y degradación de proveedores |
| P2-027 | 3 (P2) | Caché opcional búsqueda TTL | Implementado; CI actual pendiente | `src/search/SearchService.ts`, `tests/search.test.cjs` | Revalidar identidad de nodos y reemplazo en CI |
| P2-028 | 3 (P2) | Documentación y migración | Implementado parcialmente | `docs/migrating-from-moonlink.md`, `README.md` | Guías de API completas, recetas y changelog de release |
| P2-029 | 3 (P2) | API pública CJS/TS end-to-end | CI verificado | `tests/types/public-api.ts`, `scripts/test-package.cjs` | Repetir tras fijar la versión candidata |
| P2-030 | 4 (P2) | Nombre y titularidad npm | Implementado parcialmente | `package.json`, `scripts/release-policy.cjs` | Verificar propiedad npm y permisos de distribución |
| P2-031 | 4 (P2) | Release candidate | Pendiente | `docs/release-5.3-plan.md` | Preparar 5.3.0-rc.1, probar instalación npm next |
| P2-032 | 4 (P2) | Benchmarks y fugas | CI verificado, auditoría parcial | `scripts/benchmark.cjs`, `scripts/endurance.cjs` | Registrar memoria sostenida de larga duración |
| P2-033 | 4 (P2) | OSL-3.0 y atribuciones | OSL preservada, aviso de modificación incluido en npm y prueba de integridad añadida; revisión legal pendiente | `LICENSE`, `NOTICE.md`, `package.json`, `scripts/check-package.cjs`, `scripts/test-package.cjs`, `docs/license-attribution-review.md` | Comparar avisos de copyright de origen, revisar assets y aceptar legalmente antes de publicar |
| P3-034 | 5 (P3) | VoiceReceiver NodeLink opt-in | Implementado parcialmente | `src/entities/VoiceReceiver.ts`, `tests/voice-receiver-lifecycle.test.cjs` | Privacidad, consentimiento y recepción en vivo |
| P3-035 | 5 (P3) | YouTube LiveChat | Implementado, lifecycle con regresiones | `src/entities/YouTubeLiveChat.ts`, `tests/youtube-livechat-lifecycle.test.cjs`, `docs/phase-3-nodelink.md` | Verificar chat real, permisos del proveedor y rate limits |
| P3-036 | 5 (P3) | Storage externo y multi-proceso | Redis CAS, leases e IPC de voz v2 con secuencias y entrega serializada; CI final en verificación | `src/database/RedisStorage.ts`, `src/database/RedisGuildLeaseCoordinator.ts`, `src/cluster/GuildOwnership.ts`, `src/cluster/RedisGuildIpcRouter.ts`, `tests/integration/redis-guild-ipc.test.cjs`, `tests/redis-guild-ipc.test.cjs`, `docs/redis-storage.md` | Completar CI del SHA definitivo, migrar clientes IPC v1 a v2, enlazar gateway autenticado y probar traspaso audible entre shards |
| P3-037 | 5 (P3) | API privada de métricas opt-in | Implementado, CI final pendiente | `src/observability/PrivateMetricsServer.ts`, `tests/private-metrics.test.cjs`, `tests/types/public-api.ts`, `docs/private-metrics.md` | Verificar CI en HEAD, integración con panel autorizado y privacidad operativa real |
| P3-038 | 5 (P3) | Refactor gradual Node/Player | Implementado parcialmente | `src/players/PlayerMigration.ts`, `src/nodes/SessionRecovery.ts` | Completar límites de módulos sin romper API |

## Ampliaciones acordadas después del plan original

El inventario de NodeLink del 20 de noviembre y los cambios posteriores amplían la aceptación, pero **no sustituyen** las 38 tareas originales.

1. Reproducción y confirmaciones REST: play/pause/seek/volume, concurrencia, comandos serializados.
2. Queue, autoplay y recomendación: prioridad del usuario, cancelación, fallback entre fuentes y recomendaciones por pista semilla.
3. Smart transitions: nextTrack/preload, gapless, crossfade, Smart Crossfade/AutoMix y mezcla audible; no confundir una respuesta HTTP positiva con audio escuchado.
4. NodeLink moderno: source health, provider status, letras/captions, capítulos, grupos, mixer, SponsorBlock, stream y extensiones sujetas a capabilities reales.
5. Lavalink plugins: LavaLyrics, SponsorBlock, compatibilidad y pruebas de instancias con plugins fijados.
6. Múltiples nodos: selección saludable, carga/región, circuit breaker, failover, resume/rollback, ownership y cola de recuperación.
7. Plataforma de desarrollo: API pública, CommonJS/TypeScript, conectores, storage opcional, muestras y migraciones.
8. Observabilidad, seguridad y rendimiento: logger opt-in, saneamiento, diagnósticos, métricas seguras, auditoría y pruebas de estrés.
9. Release y marca: README, licencia Moonlink OSL-3.0, changelog, candidata, instalación externa, tag y publicación npm.

La personalización de gustos por usuario y la UI/catálogo musical de OBEY **no forman parte del runtime de NyxLink**; NyxLink debe exponer capacidades para que esos productos las implementen.

## Camino de cierre por dependencias

1. **Resolver el alcance y aceptación** de P3-037 (API privada de métricas) y P3-036 (multi-proceso); son opt-in y no deben introducir servicios obligatorios.
2. **Ejecutar CI sobre el HEAD actual**, registrar run ID, comparar cada P0/P1 contra la matriz y resolver fallos sin introducir funcionalidades no solicitadas.
3. **Completar evidencias funcionales** de P1-019 y P2-022: reproducción Discord real, crossfade escuchado, interrupciones, NodeLink moderno y recuperación de nodo con servidor real. Ver `docs/live-voice-verification.md`.
4. **Cerrar P2-028 / P2-033 / P2-030** con docs, licencia y verificación de derechos/propiedad de npm; preparar release notes.
5. **Aceptar las extensiones P3** con pruebas y documentación (o explícita decisión de alcance), sin confundirlas con el núcleo estable.
6. **Preparar 5.3.0-rc.1** y verificar fresh install del artefacto npm `next` en un bot de prueba; repetir toda la suite en el SHA de candidata.
7. **Aprobar la estable** `v5.3.0` y `nyxlink@5.3.0` en npm `latest` solo después de todas las puertas de salida.

**No publicar** mientras haya bloqueo P0/P1, regresión crítica conocida, secreto en artefactos o aceptación de voz incompleta.
