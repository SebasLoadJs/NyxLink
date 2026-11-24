# Cierre técnico del bloque de modernización

Fecha: 24 de noviembre de 2026. Alcance: implementación del SDK sobre Lavalink v4/NodeLink, manteniendo la API y sin publicar. La aceptación externa se conserva en [pendientes de pruebas reales](pending-real-world-acceptance.md). Este cierre no certifica inexistencia de bugs ni compatibilidad con cualquier versión/proveedor futuro.

## Inventario de responsabilidades y revisión

| Área | Implementación existente conservada | Defectos o incrementos resueltos en esta rama | Evidencia automatizada / límite |
| --- | --- | --- | --- |
| Arquitectura, managers y entidades | Manager/NodeManager/PlayerManager; entidades públicas como fachada | Extensiones opcionales con lifecycle aislado; shutdown del logger | `extensions.test.cjs`, tipos y consumidor empaquetado |
| REST y WebSocket | Contratos v4, adapters y validación por operación | Observación HTTP redactada, apertura de streams sin simular fin del audio | Contratos/protocolo, pruebas de trazas REST, laboratorios fijados |
| Node y sesiones | SessionRecovery, RecoveryQueue, NodeFailover, circuitos | VoiceRecovery compartido; restart sin destruir una intención nueva; límites de descarga del lab | Regresiones de recuperación, ownership, worker, sesión y fallos tardíos |
| Selección | Backend/capacidades, salud, mantenimiento, región y fuente | Coste ponderado opt-in de métricas observadas, antigüedad y margen de histéresis | `node-selection.test.cjs`; carga/regiones reales en LIVE-11 |
| Player y comandos | PlayerCommandQueue, PlaybackGuard y PlaybackAttempt | Volumen async cercado ante destroy/sesión reemplazada; mixer serializado/cancelable | `player-commands.test.cjs`, pruebas mixer y tipos |
| Preload y transiciones | Crossfade, nextTrack, reserva hasta TrackStart | Política y planificador extraídos a `players/QueuePreload.ts`; refresh coalescido y backoff conservados | `queue-preload.test.cjs`, `preload-consumption.test.cjs`, `crossfade-contracts.test.cjs` |
| Migración | PlayerMigration, resolución en destino, snapshots y rollback | Etapas observadas con IDs/duración; cleanup fallido sigue siendo parcial | Regresiones de migración y laboratorio bidireccional; escucha en LIVE-06 |
| Queue/autoplay/search/tracks | Cola validada, AutoPlayManager, SearchService, TrackCodec/Resolver | Se conservan transacciones, cancelación, fallback/cache/deadline y resolución dirigida al destino | Suites queue/autoplay/search/track; recomendaciones/proveedores reales en LIVE-08 |
| Persistencia/distribuido | Snapshots versionados, CAS, Redis leases e IPC | Se conservan fencing de ownership y aislamiento de reportes | Redis CI Node 22/24; handoff audible en LIVE-09 |
| Discord y recepción | VoicePacketHandler, conectores, VoiceReceiver y LiveChat opt-in | Runner sin credenciales por defecto; separación de pruebas y configuración privada | Suites lifecycle/gateway y seguridad del runner; LIVE-01–10 |
| Logging/observabilidad | Fachada Logger compatible, API privada de métricas | Pipeline acotado, redacción, destinos, JSON, contexto, timeline, trace, diagnósticos y dashboard opt-in | Regresiones de canarios, sinks lentos/fallidos, saturación y cierre; LIVE-12/SOAK |
| Dependencias y distribución | Node >=22.12, pnpm fijado, Consola 3.4.2, OSL-3.0 | Invocación Windows sin shell; comprobación tarball, avisos y CJS/ESM | Audit de producción, pack, tipos; permisos/assets/publicación en RELEASE-01–03 |
| Documentación y DX | Quickstart y migración Moonlink | Guías de API, mixer, extensiones, logging, selección y referencia generada; ejemplos compilados | `generate-api-reference.cjs --check`, consumidor aislado |

La reducción de Node/Player se hace por responsabilidades, no por longitud de archivo: Node conserva transporte y dispatch; Player conserva su estado público, reservas y confirmaciones. SessionRecovery, VoiceRecovery, PlayerMigration, comandos, intentos de reproducción y QueuePreload tienen límites separados. No se necesita una reescritura ni mover métodos públicos para cerrar este incremento gradual.

## Frontera con NodeLink upstream

Revisión inmutable: [`97bbce1`](https://github.com/PerformanC/NodeLink/tree/97bbce1e169f18811c69836e3d0fa7f87e1d13fe). Se contrastaron el inventario de rutas, [`sessions.id.players.ts`](https://github.com/PerformanC/NodeLink/blob/97bbce1e169f18811c69836e3d0fa7f87e1d13fe/src/api/sessions.id.players.ts), [`player.types.ts`](https://github.com/PerformanC/NodeLink/blob/97bbce1e169f18811c69836e3d0fa7f87e1d13fe/src/typings/playback/player.types.ts) y la responsabilidad de [`AutoMixRegistry`](https://github.com/PerformanC/NodeLink/blob/97bbce1e169f18811c69836e3d0fa7f87e1d13fe/src/playback/processing/AutoMixRegistry.ts). No se incorporó implementación de servidor.

| Función | Contrato/responsabilidad | Decisión del cliente |
| --- | --- | --- |
| Crossfade/nextTrack | PATCH por player, modos preload/stream/smart | Tipos, validación, comandos y reserva presentes; ACK no prueba audio |
| AutoMix Registry | Análisis/planificación interna, configuración del servidor | Se usa el contrato de preparación; no hay un endpoint separado `setAutoMix` en el inventario revisado |
| Workers, HTTP/2, HLS, MP4/fMP4, DSP | Extracción, demux, transporte y procesamiento del servidor | No duplicarlos dentro del SDK; consumir streams/errores/capacidades expuestos |
| Source Health, grupos, mixer, SponsorBlock, letras/captions y capítulos | Rutas/extensiones públicas revisadas | Admission por capacidad y pruebas por perfil; aceptación con contenido/proveedor activo queda en LIVE |

Compatibilidad fijada: Lavalink 4.2.2, NodeLink baseline `804e0d6`, moderno `97bbce1`; plugins LavaLyrics 1.1.0 y SponsorBlock 3.0.1, con imágenes/artefactos inmutables en `tests/integration/backend-servers.json`. NodeLink seek con parche tiene su job separado; no se generaliza ese resultado a una imagen sin parche. La [matriz histórica y sus limitaciones](backend-compatibility.md) sigue disponible.

## Criterio de entrega de este incremento

El bloque se entrega tras build estricto, suite Node 22/24, tipos, ejemplo, API generada, consumidor tarball y checks CI del mismo SHA (incluida endurance de 600 s). Los resultados se registran en el PR #32 con el SHA, sin reutilizar verde histórico para cambios nuevos. El inventario original de 38 IDs y los 24 capítulos permanece trazable en las matrices; aceptación externa y publicación no se convierten en tareas aprobadas al terminar código.
