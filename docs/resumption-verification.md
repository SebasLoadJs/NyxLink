# Verificación de reanudación — 23 de noviembre de 2026

Base: `03546fd49faffdaaf9e0ad45e1e9c7439ec749a6`. Rama local: `codex/resume-stabilization`. Entorno: Windows, Node.js 24.11.1, pnpm 10.34.5 invocado mediante `npx --yes pnpm@10.34.5`. No se hicieron commits, push, tags ni publicaciones.

| Componente | Estado anterior | Cambio | Evidencia local | Estado final |
| --- | --- | --- | --- | --- |
| Laboratorio de backends | Descarga implícita dentro de `run`, límite común de 120 s | Descarga separada, digest preservado, máximo dos intentos de 180 s para errores transitorios; arranque sin pull implícito | Ocho pruebas de caché, retry, agotamiento, fallos permanentes, perfil local, redacción y timeout de un proceso real | Implementado; ejecución Docker y CI pendientes |
| Diagnóstico de contenedores | `execFile` podía incluir la contraseña de laboratorio en el comando de error | Operación y salida acotada con contraseña redactada; clasificación de timeout | Prueba con canario en mensaje, argumentos, stdout y stderr | Automatizado verificado localmente |
| Scripts de paquete en Windows | `pack:check` fallaba con `spawnSync npm.cmd EINVAL` | Invocación del CLI JavaScript instalado mediante Node sin shell; mismos argumentos y aserciones de paquete | `pack:check` y seis comprobaciones de instalación aislada aprobadas | Verificado localmente |
| API del SDK y dependencias | Base de desarrollo existente | Sin cambios de API pública, versiones ni lockfile | TypeScript estricto, tipos públicos y auditoría de producción aprobados | Sin diferencias de contrato |

Comprobaciones ejecutadas:

- `pnpm install --frozen-lockfile`: aprobado con pnpm 10.34.5.
- `pnpm run typecheck:strict`: aprobado.
- `pnpm run test:types`: aprobado.
- `pnpm run test:coverage`: 881 pruebas aprobadas, cero fallos. Incluye las primeras siete pruebas del nuevo helper; después se añadió y aprobó una octava que verifica timeout real de proceso. Log local ignorado por Git: `.runtime/resumption/coverage.log`.
- `node --test tests/container-command.test.cjs`: ocho pruebas aprobadas después del último cambio del helper.
- `pnpm audit --prod --audit-level=high`: sin vulnerabilidades conocidas.
- `pnpm run pack:check`: aprobado después de corregir la invocación en Windows; 239 archivos, sin publicación.
- `pnpm run test:package`: aprobado; seis comprobaciones de instalación aislada del tarball, identidad/licencia, CommonJS, ESM, consumidores TypeScript y ejemplos. Reporte local: `.runtime/package/report.json`.

No se ejecutaron los laboratorios de backends/plugins ni endurance: falta Docker y el helper requiere Linux. Tampoco se ejecutaron Node.js 22, Redis, CodeQL remoto ni pruebas de voz Discord. Este registro no certifica CI verde, continuidad audible ni cierre contractual de tareas. No se modificaron las imágenes fijadas ni se relajaron aserciones de protocolo. No hay benchmarks nuevos en este bloque.

Las comprobaciones usaron una compilación nueva del código fuente. `dist` ya estaba versionado con artefactos anteriores; los cambios de compilación generados en esta sesión se retiraron del diff. Ejecutar `pnpm run build` antes de consumir el checkout; los scripts de test y empaquetado instalable ya lo hacen.

Archivos de implementación: `tests/helpers/container-command.cjs`, `tests/helpers/backend-lab.cjs`, `tests/container-command.test.cjs`, `scripts/package-manager-command.cjs`, `scripts/check-package.cjs` y `scripts/test-package.cjs`. Documentación: este registro, `backend-compatibility.md`, `master-plan-reconciliation.md` y `CHANGELOG.md`.
