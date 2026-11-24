# Pendientes de aceptación real — a cargo del operador

El responsable decidió ejecutar estas pruebas más adelante. Este registro separa esa aceptación de la implementación y las regresiones automatizadas: no bloquea continuar el trabajo de código. Ninguna fila está aprobada por tener un runner o un CI verde.

## Procedimiento y evidencia

Usar el [procedimiento en español](run-live-tests-es.md), la plantilla `.env.live-voice.example` y `scripts/test-live-suite.cjs`. Las credenciales se cargan únicamente en archivos locales ignorados. `--check` valida sin conectar; solo `--armed` ejecuta. Mantener los reportes privados y registrar el SHA exacto del candidato, versiones/plugins de ambos nodos, fecha y resultado observado. Cambiar el código invalida evidencia de un candidato anterior.

| ID | Prueba pendiente | Criterio de aceptación y evidencia |
| --- | --- | --- |
| LIVE-01 | Comandos en Lavalink | Reproducir las dos fixtures propias; escuchar audio; comprobar pausa/resume, volumen, seek, skip y stop; conservar reporte `commands` y notas humanas |
| LIVE-02 | Comandos en NodeLink | Mismos comandos y escucha, usando configuración NodeLink separada |
| LIVE-03 | Reconexión Lavalink | Reporte `reconnect`, voz recuperada y estado/posición realmente observados; documentar interrupción |
| LIVE-04 | Reconexión NodeLink | Reporte `reconnect`, mismo criterio; no inferir recuperación audible del WS ready |
| LIVE-05 | Crossfade/preload/AutoMix | Reporte `crossfade` NodeLink y escucha de ambas fixtures; documentar solapamiento, cortes y modo; HTTP ACK solo prueba control |
| LIVE-06 | Fallo de nodo, partición y transferencia entre backends | Inyectar fallos controlados; verificar ownership, cola, pausa, volumen, filtros compatibles y posición; registrar rollback/cleanup parcial y duración de corte. El runner de reconexión no sustituye esta prueba manual |
| LIVE-07 | Mixer activo | Crear dos capas, cambiar volumen 0..1, remover, provocar error y ejecutar stop/destroy/transferencia. Escuchar resultado e inspeccionar cleanup remoto; no asumir migración automática de capas |
| LIVE-08 | Fuentes, letras, capítulos y SponsorBlock | Proveedores permitidos con contenido real; probar idioma/onlyCaptions, línea después de seek, ausencias, permisos, 429 y segmentos omitidos audiblemente. Laboratorio con proveedores deshabilitados no cubre esto |
| LIVE-09 | Grupos sincronizados y distribuido | Dos players/shards con Redis, transferencia de ownership e IPC; medir sincronía y duplicados de voz. El CAS local no certifica handoff audible |
| LIVE-10 | VoiceReceiver y LiveChat opt-in | Servidor/canal autorizado, participantes informados y consentimiento, creación/cierre/reconexión; comprobar recepción real y permisos/rate limits sin conservar datos de terceros innecesarios |
| LIVE-11 | Orquestación bajo carga y regiones | Nodos reales con latencias/carga distintas; comprobar estrategias, pesos e histéresis configurados, fuentes y mantenimiento. Registrar métricas observadas sin prometer SLA |
| LIVE-12 | Observabilidad operativa | Inspeccionar logs reales con canarios sin secretos, timeline y paneles TTY/no-TTY, API privada autenticada, sink lento/fallido y apagado. Revisar que no salgan tokens/sessionIds/audio/payloads |
| SOAK-01 | Protocolo aislado 24–72 h | `scripts/test-soak.cjs --check` y después `--armed` en Linux con contenedores; reporte con duración efectiva y SHA sin cambios. No usa voz Discord |
| SOAK-02 | Carga de voz representativa | Mantener sesiones reales autorizadas; medir memoria/ELU, reconexiones, recursos/listeners y errores sostenidos. El soak de protocolo y el benchmark corto no sustituyen esta ejecución |

Los primeros cinco escenarios están automatizados parcialmente por el runner; la escucha es humana. Los demás requieren el ejercicio operativo descrito, no están incluidos implícitamente en esos cinco reportes. Fixtures originales: `pnpm run fixtures:live`; el operador debe alojarlas donde los nodos puedan descargarlas.

## Puertas externas de publicación, separadas de las pruebas

| ID | Pendiente | Responsable / condición |
| --- | --- | --- |
| RELEASE-01 | Derechos del banner y demás assets, atribuciones de origen y revisión de distribución OSL | Responsable del proyecto; [inventario de procedencia](license-attribution-review.md). No se presume licencia de un asset por estar en Git |
| RELEASE-02 | Titularidad/acceso npm, versión candidata no publicada y permisos de release | Responsable con cuenta npm; preflight informativo no verifica propiedad |
| RELEASE-03 | Decisión de RC/estable, autorización de publicación y merge | Responsable; [runbook](release-5.3-rc-runbook.md). Commit/push/PR autorizados no equivalen a merge, tag o publish |

## Registro a completar

Para cada ID: `estado = pendiente | aprobado | falló`, SHA completo, fecha, backend/revisión/plugins, comando o pasos, ruta privada del reporte, observación humana y defecto reproducible si falló. No adjuntar secretos, audio de terceros ni dumps de voz al PR. Todos los IDs de este documento empiezan en **pendiente**.
