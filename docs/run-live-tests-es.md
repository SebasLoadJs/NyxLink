# Pruebas de voz listas para el operador

El responsable ejecutará estas pruebas más adelante. No se ha conectado el bot ni reproducido audio en esta sesión. El ejecutor permite revisar toda la configuración **sin red** antes de armar la prueba real.

## 1. Preparar las dos configuraciones privadas

Desde la raíz del repositorio, en PowerShell:

```powershell
Copy-Item .env.live-voice.example .env.live-nodelink
Copy-Item .env.live-voice.example .env.live-lavalink
```

Completá ambos archivos localmente. Usá el bot, guild/canal y nodos de prueba autorizados. No pegues tokens en el chat. Los archivos `.env.live-nodelink` y `.env.live-lavalink` están excluidos de Git; la plantilla permanece vacía y versionada.

Cada archivo debe contener **todas** las variables requeridas, incluso si el bot/canal es el mismo. El runner elimina las variables `NYXLINK_*` heredadas y no completa credenciales ni opciones ausentes desde otro despliegue. Ajustá host, puerto, password y `NYXLINK_NODE_SECURE` para cada nodo. El runner selecciona explícitamente el backend correspondiente a cada archivo.

Los valores se leen literalmente: no hay expansión de `$()`, variables, JavaScript ni comandos. Se aceptan `CLAVE=valor`, valores entre comillas completas, líneas vacías y comentarios que comiencen con `#`. No se admiten claves ajenas a la configuración NyxLink del harness ni campos duplicados.

## 2. Usar audio de prueba controlado

```powershell
node scripts/create-live-fixtures.cjs
```

Genera `tone-a.wav` y `tone-b.wav` originales, de 30 segundos, en `.runtime/live-fixtures/`. No abre servidores ni sube archivos. Publicalos mediante tu HTTP(S) de pruebas autorizado, accesible desde **ambos nodos**, y colocá las dos URLs diferentes en `NYXLINK_LIVE_TRACK_A` y `NYXLINK_LIVE_TRACK_B`. También podés usar otros WAV autorizados de 15–120 segundos.

## 3. Revisar sin conexión al bot

```powershell
node scripts/test-live-suite.cjs --nodelink-env .env.live-nodelink --lavalink-env .env.live-lavalink --check
```

Valida los cinco escenarios sin iniciar hijos, login, voz ni requests a los nodos. Comprueba la forma de la configuración; no certifica conectividad. No imprime tokens, passwords, URLs ni contenido de los archivos.

## 4. Ejecutar cuando estés listo para escuchar

El código fuente debe estar limpio en Git para que la evidencia quede ligada a un SHA. Los `.env.*` privados y los archivos de `.runtime/` no cuentan como cambios de fuente; el harness reconstruye `dist` antes de login.

```powershell
node scripts/test-live-suite.cjs --nodelink-env .env.live-nodelink --lavalink-env .env.live-lavalink --armed
```

Ejecuta en orden:

1. NodeLink: reproducción, pausa/resume, volumen, seek y skip.
2. NodeLink: desconexión/reconexión y recuperación.
3. NodeLink: crossfade y preload de la segunda pista.
4. Lavalink v4: reproducción y comandos.
5. Lavalink v4: desconexión/reconexión.

Se detiene ante el primer fallo, dejando los siguientes como `not-run`; el harness individual intenta su cleanup. Cada hijo tiene un límite externo de 10 minutos además de los deadlines internos. Los secretos pasan por el entorno del hijo, nunca por sus argumentos. Para repetir un modo por separado, consultá [los comandos individuales](live-voice-verification.md).

## 5. Revisar los resultados y escuchar

Los cinco reportes individuales se conservan en `.runtime/live-voice/`. El resumen de la suite queda en `.runtime/live-suite/`, sin credenciales ni URLs. Si cambia el checkout durante la suite, el resumen invalida su SHA y no declara aprobado el conjunto. Un resumen con `passed: true` solo prueba éxito de los procesos/protocolo, **no** confirma audibilidad ni autoriza una release.

Después ejecutá:

```powershell
node scripts/check-live-voice-evidence.cjs
```

Un operador debe confirmar por separado audio audible, pausa/resume, volumen, seek, transición, crossfade sin cortes y recuperación. Registrá fecha, SHA, backend/versión y observaciones en tu evidencia privada. No confirmes audio por los eventos WebSocket únicamente. `audioVerified` y `releaseApproved` permanecen en `false` porque el runner no puede emitir esa aceptación humana.

Si falla una prueba, conservá el reporte privado y compartí solo el modo, etapa, código de error y SHA, sin tokens ni URLs. El detalle técnico de permisos, límites y criterios sigue en [live-voice-verification.md](live-voice-verification.md).

## Soak de protocolo/memoria de 24–72 horas

En un host Linux con Docker/Podman, hay un ejecutor separado que conserva el mismo proceso/SDK durante toda la duración, sin reiniciar el cliente en bloques de dos horas:

```bash
node scripts/test-soak.cjs --hours 24 --check
NYXLINK_CONTAINER_ENGINE=docker node scripts/test-soak.cjs --hours 24 --armed
```

Admite horas enteras entre 24 y 72. El comando normal de endurance conserva su límite de 7200 segundos; la ampliación larga solo se habilita por este runner. Compilá antes con `pnpm run build` y usá un checkout limpio. El host debe permanecer disponible durante toda la prueba. Un Ctrl+C solicita terminar el worker y permite que el laboratorio intente cerrar sus contenedores.

Guarda evidencia privada en `.runtime/soak/`: muestras de memoria, actividad, latencias, reconexiones, limpieza y SHA. El worker usa el laboratorio aislado con imágenes fijadas y rechaza enviar paquetes de voz Discord. No requiere token de bot y no certifica audio audible ni carga real de producción. Esta prueba larga queda preparada para el operador; no se ejecutó durante la implementación.
