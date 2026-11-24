# Modernización — implementación y evidencia local

Actualización: 24 de noviembre de 2026 (Paraguay). Base: `03546fd49faffdaaf9e0ad45e1e9c7439ec749a6`; rama de trabajo `codex/resume-stabilization`. Este documento registra los 24 capítulos complementarios y **no sustituye ni duplica** los IDs del backlog original de 38 tareas. La evidencia remota se identifica por SHA; no hay una nueva release publicada.

Tras autorización explícita del responsable se creó el commit de implementación `eeb72264` y el [PR de desarrollo #32](https://github.com/SebasLoadJs/NyxLink/pull/32). El commit `2981fd84` amplió el gate de endurance de 600 s a PRs hacia `dev`. Sus nueve workflows terminaron con éxito: [validación Node 22/24](https://github.com/SebasLoadJs/NyxLink/actions/runs/45304877007), [protocolos y plugins](https://github.com/SebasLoadJs/NyxLink/actions/runs/45304877005), [Redis](https://github.com/SebasLoadJs/NyxLink/actions/runs/45304877291), [CodeQL](https://github.com/SebasLoadJs/NyxLink/actions/runs/45304877206), [endurance 600 s](https://github.com/SebasLoadJs/NyxLink/actions/runs/45304877235), smoke, Qodana, tipos y seek parcheado. Esta evidencia no certifica automáticamente los commits posteriores de trazas/handoff; consultar los checks del HEAD del PR. No se fusionó el PR ni se publicó una versión.

El responsable confirmó que hará las pruebas de voz más adelante. Quedaron preparados el [handoff en español](run-live-tests-es.md), cinco escenarios armados explícitamente y un runner separado de soak 24–72 h. No se usaron credenciales reales ni se conectó el bot.

Continuación solicitada: las pruebas externas y puertas de publicación se consolidaron en [pending-real-world-acceptance.md](pending-real-world-acceptance.md), con IDs, criterios y responsable. El [cierre técnico](implementation-closure.md) inventaría los módulos y la frontera upstream. Este incremento añade selección ponderada/histéresis opt-in, separa política/planificador de preload y corrige confirmaciones de volumen tras destroy o reemplazo de sesión. La evidencia CI de `770053d8` fue satisfactoria (nueve workflows, endurance 600,6 s); el nuevo incremento requiere sus propios checks en el HEAD del PR.

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
| Documentación | Guías fragmentadas y API parcial | Guías API/logging/mixer/extensiones, referencia generada de 208 exports y ejemplo compilable | Consumidor TypeScript, comparación de declaraciones y tarball | Implementado; aceptación contractual final aparte |

## Matriz de los capítulos originales 0–23

| Capítulo | Estado conservador | Evidencia o deuda específica |
| --- | --- | --- |
| 0 — Misión principal | En desarrollo | Cliente Lavalink v4/NodeLink conservado; publicación y aceptación final pendientes |
| 1 — Auditoría técnica completa | Revisión técnica documentada | Inventario por subsistema, defectos corregidos y límites upstream en implementation-closure.md; no certifica ausencia de todos los bugs |
| 2 — Modernización del núcleo | Incremento gradual implementado | Límites SessionRecovery/VoiceRecovery/PlayerMigration/comandos/intentos/QueuePreload; fachadas públicas conservadas y volumen async cercado |
| 3 — Multi-backend engine 2.0 | Verificado en CI en 2981fd84; revalidar HEAD | Adapters/capacidades y laboratorios baseline/modern/plugins aprobados; la voz real permanece separada |
| 4 — Smart node orchestration | Implementado; aceptación externa separada | Selector por restricciones, fuentes/salud/circuitos; pesos e histéresis opt-in; LIVE-06/11 para carga/regiones/continuidad |
| 5 — Player engine/audio | Cliente implementado; aceptación de audio separada | Cola/replay/preload/crossfade y mixer tipado/concurrente; AutoMix interno del servidor; LIVE-05/07 para audio/cleanup remoto |
| 6 — NodeLink intelligence | Contratos de revisión fijada implementados | Salud/fuentes/stream/grupos/lyrics/mixer; AutoMix y workers delimitados como servidor, sin inventar endpoints; proveedores activos en LIVE-08 |
| 7 — Observability engine | Implementado localmente; aceptación operativa pendiente | Pipeline, JSON/destinos, privacidad, counters, HTTP/open-stream spans y eventos de lifecycle; sin inferir internos del servidor |
| 8 — Terminal design system | Implementado localmente; refinamiento visual abierto | Layouts diferenciados compact/standard/detailed/diagnostic, ASCII/NO_COLOR, ancho y paneles observados |
| 9 — Structured event timeline | Implementado localmente | Retención opt-in acotada, filtros por trace/guild, records inmutables; no almacenamiento durable |
| 10 — Player trace view | Implementado localmente | Vista terminal/JSON por guild/trace, límites explícitos, sin estado inferido; profundidad depende de los eventos observados |
| 11 — Failover visual reporter | Implementado localmente; aceptación live pendiente | Etapas observadas de resolución/restauración/persistencia/cleanup/rollback con IDs/duración; fallos parciales conservados; sin redibujar panel por etapa |
| 12 — Advanced error diagnostics | Implementado localmente | Códigos/status existentes, causas redactadas y recomendaciones fundamentadas; los errores desconocidos quedan sin causa inventada |
| 13 — Live terminal dashboard | Implementado como snapshots opt-in | TTY periódico/no-TTY estático, nodos/fuentes/proceso reales; no interfaz fullscreen ni métricas no instrumentadas |
| 14 — Logging profiles | Implementado localmente | Perfiles de detalle independientes de JSON/pretty y destino; explícito nivel tiene prioridad |
| 15 — Logging API/DX | Implementado localmente | API anterior conservada, child/context/spans, destinations, flush/close y tipos compilables |
| 16 — Rendimiento/fiabilidad logger | Parcial | Cola/backpressure acotados, quarantine, sampling/grouping y benchmark; falta soak representativo |
| 17 — Dependencias | Baseline auditado, sin upgrades gratuitos | Consola 3.4.2 es la única dependencia runtime, licencia MIT; lockfile intacto; no añadir paquetes sin necesidad |
| 18 — Plugin/extension system | Implementado localmente | Setup/dispose, hooks tipados aislados, AbortSignal y cleanup; servicios/adaptadores especializados siguen siendo de la aplicación |
| 19 — Sharding/distribuido | Redis verificado en CI en 2981fd84; aceptación audible pendiente | CAS/leases/IPC v2; integración Redis Node 22/24 aprobada; voice handoff aún no escuchado |
| 20 — QA | Automatizado local y CI por SHA; gates humanos abiertos | Node 22/24, tipos/consumidor, backend/plugins/Redis/CodeQL/endurance verificados; repetir en HEAD y completar aceptación del operador |
| 21 — Documentación | Implementada y verificable | Guías, referencia generada de todos los exports públicos/protegidos, ejemplos compilados y handoff de pruebas |
| 22 — Metodología | Aplicada en este bloque | Inspección, cambios incrementales, regresiones, tipos, ejemplos y evidencia; no reescritura del SDK |
| 23 — Criterios de aceptación | No cerrados | No se declara modernización completa ni release estable con gates externos y deuda técnica abiertos |

## Validación ejecutada

- Continuación de implementación: **963/963 pruebas en Node 22.23.5 y 24.11.1**, sin fallos ni cancelaciones, concurrencia local 4; build estricto y contratos públicos aprobados. Referencia regenerada de **209 exports**, incluyendo NodeScoreWeights; ejemplo de selección compilado por el consumidor empaquetado. Logs locales privados: `.runtime/modernization/continuation-node22-tests.log` y `continuation-node24-tests.log`. El CI del nuevo commit se registra en el PR por SHA, separado de los resultados históricos siguientes.
- Consumidor del incremento en Node 24: siete comprobaciones aprobadas, incluyendo la receta de selección ponderada; pack de 275 archivos aprobado, sin publicación. Reporte: `.runtime/modernization/continuation-package-node24.json`.

- Primer candidato: 930 pruebas aprobadas en Node.js 24.11.1 y 22.23.5, además de CI. El incremento de trazas/HTTP y handoff eleva el inventario; los resultados locales finales están en `.runtime/modernization/final-node24-coverage.log` y `final-node22-tests.log`.
- Incremento final: **951/951 pruebas aprobadas en cada versión de Node.js**, sin fallos ni cancelaciones; cobertura recogida en Node 24. Concurrencia local limitada a cuatro procesos por suite. Incluye nueve pruebas del runner de voz, dos de configuración de soak, trazas HTTP/stream y etapas de migración.
- TypeScript estricto y contratos públicos: aprobados. Los nuevos exports, mixer, logger y hooks de extensiones están tipados.
- Consumidor aislado del tarball en Node 22 y 24: siete comprobaciones aprobadas en cada versión, incluyendo nuevos exports CJS/ESM, lifecycle de extensión, visor de trazas y ejemplo compilado. `pack:check`: 269 archivos aprobados, sin secretos/runtime. Reportes: `.runtime/modernization/final-package-node22.json` y `final-package-node24.json`.
- La referencia generada contiene 208 exports; su chequeo pasó en Node 22 y 24. CI verifica que los tipos públicos y el Markdown generado coincidan.
- Auditoría de dependencias de producción repetida: sin vulnerabilidades conocidas. Inventario de licencias runtime: únicamente Consola 3.4.2, MIT; sin cambios de dependencias ni lockfile.
- Pruebas fallidas iniciales: dos fixtures mixer antiguos se actualizaron al envelope/escala verificados conservando las aserciones de carrera/ruta. La prueba de HTTP 429 usa un presupuesto independiente; el servidor colgado sigue limitado a 250 ms con aserción de terminación en menos de 2 segundos. No se cambió el timeout de producción.
- En una ejecución local simultánea con concurrencia automática, Node 22 canceló por timeout la prueba de respuesta comprimida. La prueba aislada pasó sin cambios; las suites se repitieron con concurrencia 4 para no saturar el host. No se relajó el límite de bytes ni sus aserciones y no se atribuye una causa raíz no demostrada.
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

1. Mantener CI sobre el mismo SHA final, con baseline/modern, plugins, Redis, CodeQL y endurance >=600 s; los resultados de 2981fd84 son históricos para cambios posteriores.
2. Cinco reportes Discord ligados al candidato y observación humana de audio/crossfade/reconexión. El responsable aplazó estas ejecuciones; el runner y las configuraciones vacías están listos.
3. Soak de 24–72 horas y carga representativa. El runner aislado está preparado para un host Linux con contenedores; un benchmark de segundos no sustituye esa evidencia ni la carga de voz real.
4. Mantener la frontera de compatibilidad fijada y revisar nuevas versiones cuando se adopten; el incremento Node/Player y la revisión de contratos están documentados en implementation-closure.md. El audio y proveedores activos siguen en la aceptación externa.
5. Revisión de atribución OSL-3.0 y derechos de assets, verificación de titularidad npm, decisión de versión nueva y autorizaciones separadas para RC y estable.

No se marca ninguna tarea contractual como Done ni se crea una RC para eludir estos requisitos.
