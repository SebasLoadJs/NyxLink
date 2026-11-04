<p align="center">
  <img src="https://raw.githubusercontent.com/melodiabl/NyxLink/v0.1.0-dev.2/assets/nyxlink_banner.png" alt="NyxLink — A modern Lavalink &amp; NodeLink client for Discord bots" width="100%">
</p>

<h1 align="center">NyxLink</h1>

<p align="center">
  <strong>Audio para Discord con Lavalink v4 y NodeLink.</strong><br>
  Conecta tus nodos, administra reproductores y controla la reproducción desde JavaScript o TypeScript.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nyxlink/v/0.1.0-dev.2"><img src="https://img.shields.io/npm/v/nyxlink/dev?style=flat-square&amp;color=818cf8&amp;label=npm%20dev" alt="Versión npm del canal dev"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.12.0-43853d?style=flat-square" alt="Node.js 22.12 o superior"></a>
  <a href="https://github.com/melodiabl/NyxLink/actions/workflows/pr.yml"><img src="https://github.com/melodiabl/NyxLink/actions/workflows/pr.yml/badge.svg?branch=v5.2" alt="Estado de CI"></a>
  <a href="https://github.com/melodiabl/NyxLink/blob/v5.2/dist/index.d.ts"><img src="https://img.shields.io/badge/TypeScript-types%20included-3178c6?style=flat-square" alt="Declaraciones TypeScript incluidas"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-OSL--3.0-a78bfa?style=flat-square" alt="Licencia OSL-3.0"></a>
</p>

<p align="center">
  <a href="#instalación">Instalación</a> ·
  <a href="#inicio-rápido">Inicio rápido</a> ·
  <a href="#buscar-y-reproducir">Reproducción</a> ·
  <a href="#configuración">Configuración</a> ·
  <a href="https://github.com/melodiabl/NyxLink/releases">Releases</a> ·
  <a href="https://github.com/melodiabl/NyxLink/issues">Soporte</a>
</p>

---

## Qué ofrece NyxLink

| Área | Funcionalidad |
| --- | --- |
| **Backends** | Cliente REST/WebSocket para Lavalink v4 y NodeLink, con detección de capacidades. |
| **Reproducción** | Cola, pausa, avance, búsqueda de posición, volumen, repetición y autoplay. |
| **Varios nodos** | Selección por carga, seguimiento de disponibilidad y failover con intentos limitados. |
| **Pistas** | Metadatos, requester y resolución en el backend de destino al migrar. |
| **Búsqueda** | Fuentes configurables, cancelación, timeout y caché TTL/LRU opcional. |
| **Almacenamiento** | Estado en memoria, persistencia local y un contrato para adaptadores propios. |
| **Integración** | Conector Discord.js, eventos y declaraciones de tipos incluidas. |
| **Consola** | Logger opcional con Consola, banner de terminal y estado de nodos. |

NyxLink es el cliente de tu bot. **Necesitas un servidor Lavalink v4 o NodeLink disponible** para cargar y reproducir audio. Las fuentes y extensiones disponibles dependen de la configuración y los plugins de ese servidor.

## Instalación

Requiere **Node.js 22.12 o superior**. La versión actual del canal de desarrollo es **`0.1.0-dev.2`**.

```sh
npm install nyxlink@dev
```

<details>
<summary><strong>Otros gestores y versión exacta</strong></summary>

```sh
pnpm add nyxlink@dev
```

```sh
yarn add nyxlink@dev
```

```sh
npm install nyxlink@0.1.0-dev.2
```

</details>

Para el ejemplo siguiente, instala también **Discord.js 14** en tu bot:

```sh
npm install discord.js@14
```

## Inicio rápido

Define `BOT_TOKEN` en el entorno para iniciar sesión en Discord. La conexión con el servidor de audio se configura directamente en el array `nodes`:

| Campo del nodo | Uso |
| --- | --- |
| `host` | Dirección del servidor de audio. |
| `port` | Puerto configurado en ese servidor. |
| `password` | Contraseña del nodo. |
| `secure` | `true` para HTTPS/WSS; `false` para HTTP/WS. |

Ajusta los valores del ejemplo a tu servidor. NyxLink recibe estos datos de configuración; no exige variables de entorno adicionales para el nodo.

El conector inicializa NyxLink cuando el cliente de Discord está listo y entrega las actualizaciones de voz al nodo. Regístralo **antes de llamar a `client.login()`**.

```js
const { Client, GatewayIntentBits } = require('discord.js');
const { Manager, Connectors } = require('nyxlink');

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error('Configura BOT_TOKEN.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const nodes = [{
  identifier: 'principal',
  host: 'localhost',
  port: 3000,
  password: 'tu-password-del-nodo',
  secure: false,
}];

const manager = new Manager({
  nodes,
  options: {
    database: { type: 'memory' },
    resume: true,
  },
});

manager.use(new Connectors.DiscordJs(), client);

manager.on('nodeReady', node => {
  console.log(`Nodo conectado: ${node.identifier}`);
});

manager.on('nodeError', (node, error) => {
  console.error(`[${node.identifier}] ${error.message}`);
});

manager.on('trackStart', (player, track) => {
  console.log(`[${player.guildId}] Reproduciendo: ${track.title}`);
});

client.login(token).catch(console.error);
```

Guarda la integración en `bot.js`. Si utilizas un archivo `.env`, Node.js puede cargarlo directamente:

```sh
node --env-file=.env bot.js
```

Usa `secure: true` si tu nodo está expuesto mediante HTTPS/WSS. Espera `nodeReady` antes de buscar pistas o crear reproductores.

## Buscar y reproducir

Esta función utiliza el `manager` del ejemplo anterior. Llámala desde el manejador de un comando, después de comprobar los permisos del usuario y su canal de voz.

```js
async function play(guildId, voiceChannelId, query, requester) {
  const result = await manager.search({
    query,
    requester,
    signal: AbortSignal.timeout(10000),
  });

  if (!result.tracks.length) {
    throw new Error(result.exception?.message ?? 'No se encontraron pistas.');
  }

  const player = manager.players.get(guildId)
    ?? manager.players.create({ guildId, voiceChannelId, volume: 50 });

  if (player.voiceChannelId !== voiceChannelId) {
    throw new Error('El reproductor está conectado a otro canal de voz.');
  }

  player.queue.add(result.tracks[0]);

  if (!player.playing && !player.paused && !(await player.play())) {
    throw new Error('El nodo no aceptó la reproducción.');
  }

  return player;
}
```

`query` admite texto o una URL. La función añade el primer resultado; para encolar una playlist completa puedes usar `player.queue.add(result.tracks)`. Coordina en tu bot los comandos simultáneos de una misma guild y controla los rechazos de la función.

### Controles del reproductor

| Operación | API |
| --- | --- |
| Pausar | `await player.pause()` |
| Continuar | `await player.resume()` |
| Avanzar a la siguiente pista | `await player.skip()` |
| Ir a una posición, en milisegundos | `await player.seek(60000)` |
| Cambiar volumen y esperar confirmación | `await player.setVolumeAsync(50)` |
| Detener | `await player.stop()` |
| Repetir una pista | `player.setLoop('track')` |
| Repetir la cola | `player.setLoop('queue')` |
| Desactivar repetición | `player.setLoop('off')` |
| Activar autoplay | `player.setAutoPlay(true)` |
| Destruir el reproductor | `await player.destroy()` |

Las canciones añadidas a la cola tienen prioridad sobre las recomendaciones que todavía se están buscando. Los eventos de fin `stopped`, `replaced` y `cleanup` no inician otra pista por sí solos.

`play()`, `skip()` y `transferNode()` devuelven un booleano: compruébalo antes de anunciar que la operación tuvo éxito. `setVolume()` sigue siendo encadenable; usa `setVolumeAsync()` cuando necesites esperar la respuesta del nodo.

Si se solicitan varios saltos simultáneos, las órdenes sustituidas devuelven `false` y conservan las pistas pendientes. Para avanzar varias veces de forma deliberada, espera cada llamada a `skip()`.

<details>
<summary>Eventos duplicados y repeticiones de una misma pista</summary>

NyxLink correlaciona los intentos de reproducción mediante metadata interna enviada en `track.userData`. Los objetos `Track` de los eventos normales conservan el `userData` del consumidor; `nodeRaw` y el payload del protocolo mantienen los datos recibidos.

Los eventos de un nodo anterior y los eventos identificados como duplicados se ignoran. Si un servidor no devuelve esa metadata, se utiliza el encoding y la secuencia de inicio/fin, con menor capacidad para distinguir eventos tardíos de pistas idénticas.

</details>

## Configuración

Las opciones se definen al crear `Manager`. Este ejemplo combina búsqueda, caché, recuperación y logs; activa únicamente lo que necesite tu aplicación.

```js
const configuredManager = new Manager({
  nodes,
  options: {
    database: { type: 'memory' },
    resume: true,
    search: {
      defaultPlatform: 'youtube',
      timeoutMs: 10000,
      resultLimit: 10,
      fallbackPlatforms: ['soundcloud'],
      cache: { ttlMs: 30000, maxEntries: 100 },
    },
    node: {
      selectionStrategy: 'leastLoad',
      autoMovePlayers: true,
      failover: { maxAttempts: 2, retryDelayMs: 250 },
    },
    logging: { level: 'info', banner: true },
  },
});
```

<details>
<summary><strong>Búsquedas y caché</strong></summary>

- La fuente de búsqueda debe estar habilitada en tu servidor de audio.
- El fallback se aplica a búsquedas del backend cuando el resultado está vacío o contiene un error de carga. Una URL se envía intacta y los errores HTTP, incluido 429, se propagan.
- La caché es opcional y pertenece al manager: aplica TTL, limita entradas y asigna el requester al devolver cada resultado.
- Las fuentes nativas y los resolvers personalizados no comparten esa caché. Un `signal` permite cancelar la espera; los resolvers personalizados deben cooperar para cancelar su propio tráfico.

</details>

<details>
<summary><strong>Varios nodos y recuperación</strong></summary>

Añade varios servidores al array `nodes`, cada uno con un `identifier` distinto. La selección utiliza la disponibilidad y las estadísticas del nodo; `autoMovePlayers` habilita el intento de traslado cuando se pierde la conexión.

`failover.maxAttempts` limita los destinos que se intentan. También puedes trasladar un reproductor explícitamente con `await player.transferNode(identifier)` y comprobar su resultado.

Puedes exigir un backend y capacidades al crear el reproductor:

```js
const constrainedPlayer = manager.players.create({
  guildId,
  voiceChannelId,
  nodeSelection: {
    backend: 'nodelink',
    requiredCapabilities: ['source:http'],
    region: 'eu',
    regionPolicy: 'prefer',
  },
});
```

Las regiones son etiquetas que defines con `regions: ['eu']` en cada nodo. `prefer` favorece esa región entre los candidatos de la misma clase de salud; permite otra región si es necesario. `require` la convierte en una restricción obligatoria. La comparación de etiquetas es exacta.

Las solicitudes con backend, capacidades o región requieren nodos `READY`. El backend, las capacidades y la región obligatoria nunca se relajan para encontrar un destino. Solo una capacidad marcada como `available` satisface el requisito: `unknown` y `unavailable` se rechazan. Las fuentes y filtros se obtienen de [`/v4/info`](https://lavalink.dev/api/rest#get-lavalink-info); ser NodeLink no confirma por sí solo los endpoints opcionales.

Los requisitos se copian y se conservan durante failover y `transferNode()`. Un traslado incompatible devuelve `false` antes de modificar la reproducción. Volver a crear un reproductor existente lo devuelve con sus requisitos originales.

`manager.nodes.findNode()` acepta las mismas restricciones, además de `exclude` y `allowUnhealthyFallback`; devuelve `undefined` si no hay candidato. Al crear un reproductor, ese caso lanza `NoEligibleNodeError` con código `NO_ELIGIBLE_NODE` y `rejections` por identificador, motivo y capacidades faltantes. También puedes consultar `NodeSelector.rejections(nodes, options, selection)` para obtener el diagnóstico.

Para apartar temporalmente un nodo con fallos repetidos, configura `options.node.circuitBreaker`:

```js
circuitBreaker: { failureThreshold: 3, windowMs: 30000, cooldownMs: 30000 }
```

Está desactivado por defecto. Al activarlo, protege las actualizaciones de reproductor, la carga de pistas, las estadísticas y las solicitudes de extensiones. Los fallos de red, HTTP 429 y errores de servidor cuentan para abrir el circuito; un error de pista, un HTTP 4xx o una extensión no disponible no apartan el nodo. Las cargas protegidas y los probes de estadísticas hacen un solo intento con timeout de 10 segundos. La metadata, la limpieza y las operaciones de sesión siguen disponibles para recuperación.

Mientras `node.circuit.state` sea `open` o `half-open`, el selector lo excluye. Las solicitudes protegidas rechazadas fallan con `CircuitOpenError`, código `CIRCUIT_OPEN` y `retryAt` en milisegundos Unix. Después del cooldown, una sola solicitud puede probar la recuperación; las demás se rechazan hasta que termine. `await node.probe()` solicita estadísticas válidas y devuelve si se confirma la recuperación del circuito. No inicia reproducción ni instala polling automático.

Para mantenimiento, `manager.nodes.setDraining(identifier)` impide nuevas asignaciones y conserva los reproductores existentes. `await manager.nodes.drain(identifier)` también intenta trasladarlos, uno a uno, y devuelve `true` si se han evacuado. Los drenados duplicados comparten la operación. Si falla algún traslado, devuelve `false`, conserva los snapshots y mantiene el nodo marcado para mantenimiento; no destruye reproductores por esa causa. Revisa los resultados antes de apagar el servidor.

`manager.nodes.setDraining(identifier, false)` vuelve a habilitar la selección cuando ya no hay un drenado en curso. El drenado conserva el nodo en el manager; `eject()` mantiene su comportamiento de retirada. Un probe exitoso no elimina la marca de mantenimiento.

</details>

<details>
<summary><strong>Almacenamiento y logs</strong></summary>

`database: { type: 'memory' }` mantiene el estado en el proceso. `database: { type: 'local' }` utiliza persistencia en disco y debe usarse con un solo proceso por directorio. El contrato `StorageAdapter` permite integrar otro proveedor.

El logger está desactivado por defecto. `logging` activa la salida de Consola y `banner: true` muestra el banner de terminal. Los eventos `debug` contienen información técnica y pueden incluir credenciales: revisa su contenido antes de compartirlos.

</details>

Las extensiones de NodeLink —como letras, mixer o streaming directo— requieren soporte y configuración del servidor. Maneja `FeatureUnavailableError` cuando una función no esté disponible.

## Eventos

| Evento | Cuándo se emite |
| --- | --- |
| `nodeReady` | El nodo completa la conexión y entrega su sesión. |
| `nodeError` | Se informa un error del nodo o su transporte. |
| `nodeDisconnect` | Se cierra la conexión con el nodo. |
| `nodeResume` | Se confirma la reanudación de una sesión. |
| `trackStart` | El nodo notifica el inicio de una pista. |
| `trackException` | El nodo informa un error al reproducir una pista. |
| `queueEnd` | Se agota la cola de reproducción. |
| `playerDestroy` | Se destruye un reproductor. |

Los eventos y sus argumentos están definidos en [`IManagerEvents`](https://github.com/melodiabl/NyxLink/blob/v5.2/src/typings/Interfaces.ts).

## TypeScript y ejemplos

NyxLink incluye declaraciones de tipos y permite imports nombrados desde TypeScript y ESM:

```ts
import { Manager, type IManagerConfig } from 'nyxlink';

const config: IManagerConfig = {
  nodes: [{
    identifier: 'principal',
    host: 'localhost',
    port: 3000,
    password: 'tu-password-del-nodo',
    secure: false,
  }],
  options: { database: { type: 'memory' } },
};

const typedManager = new Manager(config);
```

| Ejemplo | Contenido |
| --- | --- |
| [JavaScript / CommonJS](https://github.com/melodiabl/NyxLink/blob/v5.2/examples/discordjs.cjs) | Cliente Discord.js, búsqueda, cola y cierre. |
| [TypeScript](https://github.com/melodiabl/NyxLink/blob/v5.2/examples/discordjs.ts) | La misma integración con configuración tipada. |

### Cierre de la aplicación

```js
async function shutdown() {
  try {
    await manager.shutdown();
  } finally {
    client.destroy();
  }
}
```

Llama a esta función desde el cierre de tu aplicación. `manager.shutdown()` es idempotente y libera los recursos de NyxLink; el cliente Discord pertenece a tu bot.

## Desarrollo

```sh
git clone https://github.com/melodiabl/NyxLink.git
cd NyxLink
corepack pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run test:types
pnpm run test:package
pnpm run pack:check
```

| Ruta | Contenido |
| --- | --- |
| `src/` | Código fuente TypeScript. |
| `dist/` | JavaScript compilado, declaraciones de tipos y mapas de código para el paquete npm. |
| `examples/` | Integraciones de ejemplo. |
| `tests/` | Pruebas unitarias, de contratos e integración. |
| `scripts/` | Validación del paquete y herramientas de pruebas. |

Las integraciones locales con servidores se ejecutan mediante `pnpm run test:backends` y `pnpm run test:extensions`; requieren Linux y Podman o Docker.

## Soporte y licencia

[Abre un issue](https://github.com/melodiabl/NyxLink/issues) con la versión de NyxLink, Node.js y el backend, además de una reproducción mínima del problema. Revisa los logs antes de adjuntarlos.

Mantenido por [melodiabl](https://github.com/melodiabl). Distribuido bajo [OSL-3.0](LICENSE).

Derivado de Moonlink.js, de 1Lucas1.apk y sus colaboradores. Se conservan la licencia y los avisos de origen.
