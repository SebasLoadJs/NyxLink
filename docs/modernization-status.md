# Modernización — implementación y evidencia local

Fecha local: 23 de noviembre de 2026 (Paraguay). Base: `03546fd49faffdaaf9e0ad45e1e9c7439ec749a6`; rama de trabajo `codex/resume-stabilization`. Este documento registra los 24 capítulos complementarios y **no sustituye ni duplica** los IDs del backlog original de 38 tareas. La implementación local no se ha publicado ni validado en CI remoto.

## Cambios de este bloque

| Componente | Antes | Cambio concreto | Verificación | Estado |
| --- | --- | --- | --- | --- |
| Recuperación de voz/worker | Dos flujos duplicados; WorkerFailed permitía destrucción interna de restart | `VoiceRecovery` compartido, intención/propiedad comprobadas tras cada await, restart sin destrucción interna, no reset de retry sin ack | Regresiones de sesión/stop/migración y pruebas nuevas de restart tardío/observer | Automatizado local; voz real pendiente |
| Mixer | `any`, respuestas no validadas, llamadas concurrentes sin cola | Contratos tipados, volumen 0..1, validación HTTP y comandos serializados con cancelación de lifecycle | HTTP local, malformed response, orden, fallo/cancelación y sesión reemplazada | Automatizado local; audio/servidor real pendientes |
| Logger | Consola y paneles sin pipeline común | Records inmutables redactados, destinos inyectados, JSON, perfiles/layouts, cola limitada, aislamiento/timeout de transportes | Pruebas con canarios, streams lentos/fallidos, saturación, cierre y NO_COLOR | Automatizado local |
| Correlación y timeline | Sin contexto compartido ni retención controlada | Child loggers, AsyncLocalStorage, operaciones anidadas con IDs/duración, timeline opcional | Operaciones asíncronas solapadas, filtros, orden y retención acotada | Automatizado local |
| Observabilidad | Paneles manuales y métricas de nodos/players | Snapshots de cluster/fuentes/proceso, paneles de diagnóstico, contadores privados de logging | Datos ausentes/desconectados, límites, rutas autenticadas, formato estrecho | Automatizado local; aceptación operativa pendiente |
| Extensiones | Connectors y adaptadores por subsistema | Lifecycle opcional setup/dispose, hooks tipados aislados, AbortSignal, plazos y shutdown | Ocho pruebas de fallo/timeout/registro/remoción/recursión/cierre | Automatizado local |
| Tooling Windows | npm.cmd/pnpm.cmd ejecutados directamente | Invocación sin shell de CLI instalado o exe nativo; soporte de shims con ruta estática al CLI | Pack y consumidor aislado en Windows | Validación detallada abajo |
| Documentación | Guías fragmentadas y API parcial | Guía API, logging, mixer, extensiones, ejemplo compilable y migración | Consumidor TypeScript y chequeo del tarball | Local, sin aceptación contractual final |

## Matriz de los capítulos originales 0–23

| Capítulo | Estado conservador | Evidencia o deuda específica |
| --- | --- | --- |
| 0 — Misión principal | En desarrollo | Cliente Lavalink v4/NodeLink conservado; publicación y aceptación final pendientes |
| 1 — Auditoría técnica completa | Parcial | Auditorías previas más correcciones de recuperación/mixer/logging; no auditoría exhaustiva ni eliminación certificada de todos los bugs |
| 2 — Modernización del núcleo | Parcial | Módulos existentes preservados; nueva extracción VoiceRecovery; Node y Player siguen requiriendo revisión incremental |
| 3 — Multi-backend engine 2.0 | Implementado con deuda de integración | Adapters, capacidades y protocolos existentes; repetir baseline/modern/plugins en Linux con Docker |
| 4 — Smart node orchestration | Parcial | Selector, salud, circuitos y failover existentes; carga/regiones y continuidad real pendientes |
| 5 — Player engine/audio | Parcial | Cola/replay/preload/crossfade existentes y mixer tipado/concurrente; AutoMix/audio real y cleanup remoto por backend pendientes |
| 6 — NodeLink intelligence | Parcial | Salud/fuentes/stream/grupos/lyrics existentes; contrato mixer revisado en revisión fijada; falta aceptación de todas las funciones/versiones upstream |
| 7 — Observability engine | Implementado localmente, parcial | Pipeline, JSON/destinos, privacidad, counters y trazas; instrumentación aún no cubre todas las rutas REST/WS/stream |
| 8 — Terminal design system | Parcial | Layouts, ASCII/NO_COLOR, ancho y paneles observados; refinamiento visual y diferenciación standard/detailed pendientes |
| 9 — Structured event timeline | Implementado localmente | Retención opt-in acotada, filtros por trace/guild, records inmutables; no almacenamiento durable |
| 10 — Player trace view | Parcial | Contexto/trace y timeline por guild; falta visor terminal dedicado con secuencia completa de reproducción |
| 11 — Failover visual reporter | Parcial | Paneles existentes conservados con estados confirmados; falta detalle por etapas observadas y aceptación live |
| 12 — Advanced error diagnostics | Implementado localmente, parcial | Códigos/status existentes, causas redactadas y recomendaciones fundamentadas; no diagnóstico universal automático |
| 13 — Live terminal dashboard | Implementado como snapshots opt-in | TTY periódico/no-TTY estático, nodos/fuentes/proceso reales; no interfaz fullscreen ni métricas no instrumentadas |
| 14 — Logging profiles | Implementado localmente | Perfiles de detalle independientes de JSON/pretty y destino; explícito nivel tiene prioridad |
| 15 — Logging API/DX | Implementado localmente | API anterior conservada, child/context/spans, destinations, flush/close y tipos compilables |
| 16 — Rendimiento/fiabilidad logger | Parcial | Cola/backpressure acotados, quarantine, sampling/grouping y benchmark; falta soak representativo |
| 17 — Dependencias | Baseline auditado, sin upgrades gratuitos | Consola 3.4.2 es la única dependencia runtime, licencia MIT; lockfile intacto; no añadir paquetes sin necesidad |
| 18 — Plugin/extension system | Implementado localmente | Setup/dispose, hooks tipados aislados, AbortSignal y cleanup; servicios/adaptadores especializados siguen siendo de la aplicación |
| 19 — Sharding/distribuido | Parcial | Redis CAS/leases/IPC v2 existentes; falta integración Redis actual y voice handoff audible |
| 20 — QA | Automatizado local; gates externos abiertos | Node 22/24, tipos/consumidor; Docker/CodeQL/Redis remoto, endurance y Discord no ejecutados en este bloque |
| 21 — Documentación | Ampliada, parcial | API/logging/mixer/extensiones y ejemplos; todavía falta referencia exhaustiva de cada contrato legado y aceptación editorial |
| 22 — Metodología | Aplicada en este bloque | Inspección, cambios incrementales, regresiones, tipos, ejemplos y evidencia; no reescritura del SDK |
| 23 — Criterios de aceptación | No cerrados | No se declara modernización completa ni release estable con gates externos y deuda técnica abiertos |

## Validación ejecutada

- Node.js **24.11.1**: **930/930 pruebas aprobadas**, con cobertura. Log privado local: `.runtime/modernization/node24-coverage.log`.
- Node.js **22.23.5**: **930/930 pruebas aprobadas**. Log privado local: `.runtime/modernization/node22-tests.log`.
- TypeScript estricto y contratos públicos: aprobados. Los nuevos exports, mixer, logger y hooks de extensiones están tipados.
- Consumidor aislado del tarball en Node 22 y 24: siete comprobaciones aprobadas en cada versión, incluyendo nuevos exports CJS/ESM, lifecycle de extensión, trace y ejemplo de observabilidad/mixer compilado. `pack:check`: 266 archivos aprobados, sin secretos/runtime. Reportes: `.runtime/modernization/package-node22.json` y `package-node24.json`.
- Auditoría de dependencias de producción repetida: sin vulnerabilidades conocidas. Inventario de licencias runtime: únicamente Consola 3.4.2, MIT; sin cambios de dependencias ni lockfile.
- Pruebas fallidas iniciales: dos fixtures mixer antiguos se actualizaron al envelope/escala verificados conservando las aserciones de carrera/ruta. La prueba de HTTP 429 usa un presupuesto independiente; el servidor colgado sigue limitado a 250 ms con aserción de terminación en menos de 2 segundos. No se cambió el timeout de producción.
- Las suites usan una compilación nueva de `src`, no el `dist` antiguo versionado. Los artefactos de compilación no forman parte de este cambio de fuente.
- Preflight público npm, modo informativo: `0.1.0-dev.3` ya existe; `dev` apunta a esa versión, `latest` a `0.1.0-dev.1` y no hay tag `next` en la consulta. Esto **no** verifica titularidad ni permiso de publicar. No se alteraron versiones/tags ni se publicó.

## Benchmarks locales

Windows x64, Node 24.11.1, Ryzen 5 1600; datos sintéticos, sin audio/red/terminal real. `node --expose-gc scripts/benchmark-logging.cjs`, 5000 eventos por modo:

| Modo | Eventos/s observados | p95 de encolado | Registros descartados |
| --- | --- | --- | --- |
| Silent | 1.338.760 | 0,0004 ms | 0 |
| Structured, destino sintético | 25.785 | 0,0528 ms | 0 |
| JSON, Writable sintético | 17.888 | 0,0571 ms | 0 |

Reporte: `.runtime/benchmarks/logging.json`. Son medidas de este equipo/ejecución, sin comparación histórica suficiente para afirmar una mejora de rendimiento ni SLA.

El benchmark existente de persistencia de cola también pasó: cinco muestras de 500 pistas por modo; claves de players retenidas tras destroy: **0** en todas. Inserción individual observada: 484,9–574,9 ms totales; por lote: 5,1–7,8 ms. Eso recomienda usar el API batch cuando corresponda; no certifica ausencia de leaks a largo plazo. Reporte: `.runtime/benchmark/latest.json`.

## Puertas que impiden declarar el plan terminado

1. Commit candidato inmutable y CI sobre ese mismo SHA, con baseline/modern, plugins, Redis y CodeQL. Ningún check histórico cubre este diff local.
2. Linux con Docker/Podman para laboratorios y endurance >=600 s; este equipo no tiene un motor de contenedores disponible.
3. Infraestructura Discord/nodos/fuentes autorizada, cinco reportes ligados al candidato y observación humana de audio/crossfade/reconexión. No se usaron tokens ni se conectó ningún bot.
4. Soak de 24–72 horas, métricas de heap/handles y carga representativa; un benchmark de segundos no lo sustituye.
5. Deuda explícita de las filas parciales: instrumentación completa/visor de trazas/etapas de failover, revisión adicional de Node/Player y capacidades nuevas con evidencia upstream/backend.
6. Revisión de atribución OSL-3.0 y derechos de assets, verificación de titularidad npm, decisión de versión nueva y autorizaciones separadas para RC y estable.

No se marca ninguna tarea contractual como Done ni se crea una RC para eludir estos requisitos.
