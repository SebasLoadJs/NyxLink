# Continuidad de NyxLink — leer antes de continuar

El usuario pidió implementar **todo** el documento `C:\Users\kangu\Downloads\NYXLINK_TODO_EN_UNO_PARA_IA.md`. Después pidió guardar y subir el trabajo actual para continuar en otro chat. **Este commit es un checkpoint de trabajo, no el cierre del plan.**

Repositorio: `C:\Users\kangu\Desktop\Proyectos\NyxLink`. Rama: `codex/resume-stabilization`. [PR #32 hacia dev](https://github.com/SebasLoadJs/NyxLink/pull/32). No modificar `v5.2`. Commit/push/PR ya están autorizados; merge/tag/publicación no. El usuario hará después las pruebas reales: no volver a pedir credenciales ni ejecutar Discord. Registro: [pending-real-world-acceptance.md](pending-real-world-acceptance.md).

## Auditoría y hardening adicional de código (24/11/2026)

El usuario confirmó que quiere **toda la implementación, pruebas automatizadas y correcciones en el código**, dejando a su cargo exclusivamente las pruebas con Discord, audibilidad y sesiones de voz reales. Este pedido **no autoriza** fusionar, borrar ramas, etiquetar ni publicar npm antes de los gates y decisiones ya documentados.

- Se creó [feature-contract-matrix.md](feature-contract-matrix.md) con los **27 contratos F01–F27**, rutas reales de código, pruebas, guías y puertas de aceptación. Complementa (no reemplaza) los 38 IDs y ampliaciones A–J.
- `PerformanceMonitor`: descarta ciclos READY abortados y eventos TrackStart atrasados sin perder la muestra correcta; solo contabiliza resultados Recovery con inicio observado. Tests en `tests/performance-monitor.test.cjs`.
- `TrackResolver` y `MetadataTrackResolver`: no hacer fallback después de un error del backend o respuesta directa malformada; detener las fuentes alternativas ante un error del proveedor; respetar `disabledSources` tanto al elegir proveedor como al validar el `sourceName` de la pista. Tests en `tests/track-resolution.test.cjs` y `tests/metadata-fallback-deadline.test.cjs`.
- Documentación API y CHANGELOG sincronizados. No se añadieron dependencias de logging opcionales como runtime obligatorio.

El **HEAD definitivo debe validarse por su propio SHA** con Node 22/24, build, API generada, consumidor CJS/ESM/TS, CodeQL, Redis, NodeLink moderno/baseline, Lavalink/plugins y endurance de >=600 s. Todas las comprobaciones LIVE-01 a LIVE-12, SOAK-01/02 y RELEASE-01/02/03 siguen sujetas a sus criterios reales; las que exigen escuchar audio/Discord se reservan al usuario. SOAK-01 (sin Discord) puede ejecutarse en CI o infraestructura apta; no asumir que ya pasó 24–72 h por tener el job de 600 s.

### Orden de trabajo desde este bloque

1. Revisar las Actions **del último HEAD**, no capturas históricas. Si falla una prueba, obtener logs concretos, corregir en esta rama y volver a ejecutar.
2. Completar la auditoría A–J y capítulos 0–23 enlazándolos a contratos verificables (sin inventar endpoints internos de NodeLink) y cerrar bugs reales con pruebas.
3. Mantener silencioso el logger por defecto; verificar perfiles, traza, JSON, redacción, dashboard, Pino y OTel inyectados con cobertura y pruebas de cierre; no instalar todas las bibliotecas estéticas.
4. Consolidar compatibilidad de backends y performance, ejecutar soak en infraestructura disponible sin Discord y preparar reporte de diferencias de API.
5. Solo al terminar automatizados y gates externos preparar RC/estable con autorización separada y la limpieza de ramas posterior.

## Continuación de implementación: resoluciones y búsquedas (24/11/2026)

**Checkpoint de código, no aceptación:** `270efb2f11362430e6f9da5d6f6861ed20d9b3f3` en `codex/resume-stabilization` / [PR #32](https://github.com/SebasLoadJs/NyxLink/pull/32). Las verificaciones del SHA final **están pendientes** al redactar este bloque. No asumir que resultados verdes anteriores certifican este checkpoint.

- Redacción de credenciales URL sin regex polinómica; nueva prueba adversaria y CodeQL aprobado en un SHA anterior.
- `SearchService`: invalida resultados/cache cuando cambia la instancia/sesión/backend de un nodo; `SharedSearchRequests`: cancelación de consumidores separada, cierre que desbloquea promesas de transportes colgados, tope de 128 operaciones y rechazo de nuevos usos tras shutdown. Regresiones incluidas.
- `MetadataTrackResolver`: presupuesto global configurable (1–60000 ms, 10000 por defecto) entre fuentes/consultas, timeout/cancelación que desbloquea incluso adapters que ignoran AbortSignal, descarte de ISRC explícitamente contradictorios y consumo de rechazos tardíos.
- `TrackResolver`: aborta lecturas URL directas cuando cambia la intención, con timeout propio de 10000 ms; verifica identidad de sesión/socket/backend/nodo registrado antes de aceptar encodings resueltos.
- `PlaybackGuard`, Player y PlayerMigration: propagan signal de la intención actual a resolución, precarga y transferencia; `stop()` no espera indefinidamente a un adaptador no cooperativo.
- Pruebas añadidas de cancelación, límite, cierre, reintentos, registros ISRC, sesión/nodo reemplazado, migración, promesas tardías y tipos TS; guías y referencia API sincronizadas.

**Siguiente orden:** (1) CI completo del HEAD en Node 22/24, CodeQL, Docker backend/plugins, Redis, package/consumer y endurance >=600 s; (2) corregir todas las regresiones detectadas por log; (3) continuar pruebas restantes del catálogo F01–F27, 38 IDs, extensiones A–J y capítulos 0–23, empezando por telemetría ante eventos tardíos y metadatos adversarios; (4) completar los criterios externos de aceptación antes de la RC. No fusionar, borrar ramas, etiquetar ni publicar npm hasta autorización y cierre de gates.

## Última base aceptada y alcance del checkpoint

`e4d67d336bbbae4c8b403688b24e11b185804ae3` tuvo 963 pruebas Node 22/24, siete checks de consumidor por versión y nueve workflows aprobados, incluida endurance 600,7 s. Esa evidencia **no certifica** el código nuevo del presente checkpoint. Las afirmaciones previas de que todo el plan estaba implementado fueron demasiado amplias; no repetirlas.

En esta continuación se detectaron e implementaron requisitos que faltaban:

- `PinoLogTransport` y `OpenTelemetryLogTransport`: instancias de aplicación inyectadas, sin dependencias runtime adicionales; Pino recibe records redactados y conserva su stream; OTel convierte operaciones terminadas con duración observada, sin inventar W3C parent IDs. El counter usa únicamente severidad como etiqueta.
- `PerformanceMonitor`: opt-in, independiente del nivel del logger, muestras circulares por métrica, p50/p95 de REST/apertura de stream/READY/TrackStart/recuperación, event-loop delay/ELU, memoria y recursos; cleanup de listeners/histograma en shutdown. `/performance` privado y métricas agregadas en dashboard/Prometheus.
- Recuento de comandos pendientes en PlayerCommandQueue/Player y `listenerCount()` total opcional en EventEmitter.
- `options.recommendations.score`: preferencia síncrona de aplicación por metadata inmutable; fallos/valores inválidos vuelven a selección existente; cola manual mantiene prioridad.
- Startup observado con cuatro layouts, sin readiness inventada; `FORCE_COLOR`, `NO_COLOR` y conversión a paleta truecolor, activación de startup explícita.
- `options.search.deduplicate`: coalescing backend opt-in, máximo 128 operaciones compartidas y cancelación por suscriptor; custom/native resolvers no compartidos.
- `options.search.trackResolution`: fallback explícito en destino por ISRC/título/artista/duración; fuentes limitadas, score mínimo, sin recurrencia al resolver nativo ni copiar código NodeLink. Es código nuevo que todavía necesita regresiones específicas.

## Verificación y archivos de evidencia

- Build estricto pasó; referencia API regenerada con **223 exports**.
- Suite completa del checkpoint: **979/979 pruebas aprobadas en Node 24**, sin fallos ni cancelaciones; contratos públicos TypeScript y verificación de la referencia API aprobados.
- Primera suite dirigida: 123 pruebas aprobadas antes de los últimos incrementos de búsqueda/metadata/startup.
- La siguiente suite dirigida detectó un fixture inválido (`nodes: []`) en la prueba nueva de startup; se corrigió a una configuración local válida sin conectar.
- `scripts/test-optional-logging.cjs` pasó con **Pino 10.4.0 y @opentelemetry/api 1.10.0 reales**, incluyendo TypeScript estructural, redacción/flush y stream sin cerrar, en **Node 24 y Node 22**. Las dependencias se instalaron únicamente en `.runtime/optional-adapters`, ignorado.
- Snapshot público de las 14 bibliotecas evaluadas: [logging-dependency-review.json](logging-dependency-review.json), consultado del registro npm; falta redactar decisiones, costes transitivos e interoperabilidad en la guía/ADR. Observación a revisar: `prom-client` 15.1.3 está marcado deprecated en ese snapshot; no se instaló.
- Logs privados: `.runtime/modernization/full-plan-focused.log`, `handoff-focused.log`, `checkpoint-node24-tests.log` y `.runtime/optional-adapters/report.json`. Consultar los resultados finales de este checkpoint en el PR; no asumir verde.

## Trabajo obligatorio al reanudar

1. Completar la auditoría requisito por requisito: catálogo **F01–F27**, backlog **38 IDs**, ampliaciones **A–J** y capítulos **0–23**. Crear una matriz granular que enlace cada requisito con código, tests, tipos, ejemplo, documentación y estado. Las matrices existentes no bastan para afirmar cobertura completa.
2. Añadir regresiones específicas de deduplicación: dos consumidores con requester aislado, cancelación de uno sin cancelar otro, cancelación de todos, error, shutdown, sesión/nodo reemplazado, capacidad y mapa acotado. Verificar identidad de backend/connection en la clave y cambios de sesión mientras una búsqueda está pendiente.
3. Añadir regresiones de metadata: ISRC, acentos/tokens, versiones/duración diferentes, ausencia de URI, fuentes fallback, payload inválido, errors HTTP/auth/429 sin bypass, stop/destroy/migración durante resolución, no mutar la pista/cola al fallar. Revisar si el contrato necesita un deadline/AbortSignal global para varios intentos.
4. Revisar métricas: correlación de READY/TrackStart/recuperación ante eventos tardíos, histogram shutdown, recursos y comandos rechazados; iniciar antes de init para observar CONNECTING. No afirmar audio audible con TrackStart ni latencia de descarga completa con headers de stream.
5. Actualizar guías de API/logging/selección/autoplay/búsqueda/métricas, ejemplos compilados, changelog y decisiones de dependencias; agregar los nuevos exports/métodos a pruebas de tipos y consumidor tarball. La API generada está actualizada, pero eso no sustituye recetas y pruebas.
6. Inspeccionar el resto del documento y **implementar todo requisito de código restante**, no solo cambiar estados de Markdown. Los componentes internos de NodeLink (AutoMix/DSP/workers/HLS/HTTP2) se delimitan como servidor; no inventar endpoints.
7. Completar suite Node 22, pack y consumidor del checkpoint (Node 24 completo/tipos y smoke real Pino/OTel 22/24 ya pasaron). Después repetir las comprobaciones afectadas por los cambios nuevos y revisar los nueve workflows del SHA definitivo, incluida endurance >=600 s, y actualizar el PR. No reutilizar CI de `e4d67d33` para este checkpoint.

## Comandos y precauciones prácticas

Usar `npx --yes pnpm@10.34.5 ...` (el pnpm global es distinto). Node 22: `npx --yes --package=node@22 node ...`. Suite local con `--test-concurrency=4` para no saturar este host. Windows sin Docker; laboratorios de backends/plugins/Redis se verifican en CI.

Build modifica el `dist` viejo versionado. No subir artefactos generados: antes del commit restaurar exclusivamente `dist` y retirar solo archivos nuevos de compilación dentro de esa ruta tras verificar límites. No borrar `.runtime` (contiene evidencia privada) ni archivos/configuraciones del usuario. No mostrar secretos ni dumps de logs de backend.

Las revisiones de derechos/assets, titularidad npm y autorización de release permanecen separadas en el documento de aceptación. El pedido de completar código no elimina la decisión anterior de hacer las pruebas reales después.
