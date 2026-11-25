<p align="center">
  <img src="https://raw.githubusercontent.com/SebasLoadJs/NyxLink/dev/assets/nyxlink_banner.png" alt="NyxLink — A modern Lavalink &amp; NodeLink client for Discord bots" width="100%">
</p>

<h1 align="center">NyxLink</h1>

<p align="center">
  <img src="https://raw.githubusercontent.com/SebasLoadJs/NyxLink/dev/assets/nyxlink-wave.svg" alt="NyxLink · Audio client for Discord" width="600">
</p>

<p align="center">
  <strong>Audio para Discord con Lavalink v4 y NodeLink.</strong><br>
  Conecta tus nodos, administra reproductores y controla la reproducción desde JavaScript o TypeScript.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nyxlink"><img src="https://img.shields.io/npm/v/nyxlink/next?style=flat-square&amp;color=818cf8&amp;label=npm%20next" alt="Versión publicada del canal next"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.12.0-43853d?style=flat-square" alt="Node.js 22.12 o superior"></a>
  <a href="https://github.com/SebasLoadJs/NyxLink/actions/workflows/pr.yml"><img src="https://github.com/SebasLoadJs/NyxLink/actions/workflows/pr.yml/badge.svg?branch=v5.3" alt="Estado de CI"></a>
  <a href="docs/api-generated.md"><img src="https://img.shields.io/badge/TypeScript-types%20included-3178c6?style=flat-square" alt="Declaraciones TypeScript incluidas"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-OSL--3.0-a78bfa?style=flat-square" alt="Licencia OSL-3.0"></a>
</p>

<p align="center">
  <a href="#instalacion">Instalación</a> ·
  <a href="#inicio-rapido">Inicio rápido</a> ·
  <a href="#reproduccion">Reproducción</a> ·
  <a href="#aurora">Aurora</a> ·
  <a href="#documentacion">Documentación</a> ·
  <a href="https://github.com/SebasLoadJs/NyxLink/releases">Releases</a>
</p>

---

NyxLink es un cliente TypeScript para bots musicales de Discord que conecta **Lavalink v4 y NodeLink** mediante REST y WebSocket. Administra nodos, sesiones, reproductores y colas desde una API común, con integración Discord.js y soporte para ESM y CommonJS.

## ⚡ Funcionalidades

| Sistema | Capacidades |
| --- | --- |
| **Motor de reproducción** | Cola, pausa, resume, seek, skip, volumen confirmado, filtros, repetición y autoplay. |
| **Multi-backend** | Detección de capacidades, selección de nodos por carga, región y compatibilidad, failover y migración de reproductores. |
| **Recuperación** | Reconexión, reanudación de sesiones, circuit breaker, drenado de nodos y control de concurrencia. |
| **Búsqueda** | Resolución entre backends, descubrimiento de catálogo, fuentes configurables, timeout, cancelación, fallback y caché TTL/LRU. |
| **NodeLink** | Contratos para letras, capítulos, mixer, crossfade, AutoMix, streaming y grupos, según capacidades del servidor. |
| **Lavalink** | Protocolo v4, LavaSearch, LavaSrc, LavaLyrics, SponsorBlock y LavaDSPX según plugins instalados y capacidades. |
| **Persistencia** | Memoria, almacenamiento local, Redis, snapshots versionados y control de propiedad de guilds. |
| **Aurora** | Motor único Pino, presentación Consola, terminal interactiva, diagnósticos y OpenTelemetry opcional. |
| **Desarrollo** | Tipos TypeScript, eventos, conectores, extensiones, API pública y métricas privadas. |

NyxLink controla un servidor de audio externo. El servidor Lavalink o NodeLink proporciona la reproducción, las fuentes y los plugins. La disponibilidad de funciones específicas se determina por las capacidades detectadas, no solo por el nombre del backend.

<a name="instalacion"></a>

## 📦 Instalación

**Node.js 22.12.0 o superior.** Un servidor Lavalink v4 o NodeLink operativo.

> Esta rama prepara `5.3.0-rc.2`. Los comandos de npm se podrán usar únicamente después de confirmar su publicación. Mientras tanto, compila desde un checkout de esta rama. No es una versión estable.

```sh
npm install nyxlink@5.3.0-rc.2
```

```sh
pnpm add nyxlink@5.3.0-rc.2
# o
yarn add nyxlink@5.3.0-rc.2
```

Para integrar Discord.js:

```sh
npm install discord.js@14
```

Consulta las [versiones publicadas en npm](https://www.npmjs.com/package/nyxlink) y los [releases de GitHub](https://github.com/SebasLoadJs/NyxLink/releases). La rama `v5.3` contiene la candidata a publicación; `dev` conserva la integración de desarrollo. Un tag Git no equivale a una publicación en npm.

<a name="inicio-rapido"></a>

## 🚀 Inicio rápido

Define `BOT_TOKEN` y `AUDIO_NODE_PASSWORD` en el entorno. Ajusta la dirección, el puerto y TLS a tu servidor.

```js
const { Client, GatewayIntentBits } = require('discord.js');
const { Manager, Connectors } = require('nyxlink');

const token = process.env.BOT_TOKEN;
const password = process.env.AUDIO_NODE_PASSWORD;

if (!token || !password) {
  throw new Error('Configura BOT_TOKEN y AUDIO_NODE_PASSWORD.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const nodes = [{
  identifier: 'principal',
  host: 'localhost',
  port: 3000,
  password,
  secure: false,
}];

const manager = new Manager({
  nodes,
  options: {
    database: { type: 'memory' },
    resume: false,
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


El conector se registra antes de iniciar sesión en Discord. El evento `nodeReady` indica que el nodo ha establecido su sesión.

<a name="reproduccion"></a>

## 🎵 Reproducción

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


La búsqueda acepta texto o URL. Para encolar todos los resultados de una playlist, utiliza `player.queue.add(result.tracks)`.

### Búsqueda avanzada y metadatos

```ts
const result = await manager.search({ query: 'Daft Punk', source: 'spotify' });
const metadata = result.tracks[0]?.getLavaSrcMetadata();
const holo = result.tracks[0]?.getHoloMetadata();
const collection = result.getLavaSrcMetadata();
```

Los metadatos dependen del proveedor y pueden estar ausentes. Para buscar en un nodo concreto, pasa su identificador en `node`. Las fuentes internacionales adicionales de NodeLink incluyen Amazon Music (`azsearch`), Last.fm (`lfsearch`), Shazam (`shsearch`) y Songlink (`slsearch`). Last.fm y Shazam aportan descubrimiento; Songlink resuelve enlaces, no es un catálogo de audio independiente.

Para los contratos nativos de descubrimiento `node.loadSearch()` (LavaSearch) y `node.loadNodeLinkSearch()` (NodeLink), consulta las [guías de backends](docs/backend-compatibility.md).

| Control | API |
| --- | --- |
| Pausar / continuar | `await player.pause()` / `await player.resume()` |
| Siguiente pista | `await player.skip()` |
| Posición (ms) | `await player.seek(60000)` |
| Volumen confirmado | `await player.setVolumeAsync(50)` |
| Detener | `await player.stop()` |
| Repetición | `player.setLoop('track')`, `player.setLoop('queue')` o `player.setLoop('off')` |
| Autoplay | `player.setAutoPlay(true)` |
| Migrar de nodo | `await player.transferNode(identifier)` |
| Destruir | `await player.destroy()` |

`play()`, `skip()` y `transferNode()` devuelven un booleano de aceptación de la operación. `setVolumeAsync()` espera la confirmación del nodo. La confirmación de protocolo no equivale a una comprobación audible en Discord.

## ⚙️ Configuración

```js
const manager = new Manager({
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
      circuitBreaker: {
        failureThreshold: 3,
        windowMs: 30000,
        cooldownMs: 30000,
      },
    },
  },
});
```

### Nodos y failover

```js
const player = manager.players.create({
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

La selección respeta los requisitos de backend, capacidades y región. Las preferencias de audio nativas incompatibles se conservan en memoria y se omiten durante la restauración. El evento `playerNodeFailover` informa las funciones suspendidas y el resultado de la reconstrucción opcional del Mixer. Las migraciones conservan el reproductor de origen hasta confirmar el destino; los fallos desencadenan rollback y limpieza. Las capacidades opcionales pueden devolver `FeatureUnavailableError`. Consulta [selección de nodos](docs/node-selection.md) y [compatibilidad de backends](docs/backend-compatibility.md).

<a name="aurora"></a>

## ✨ Aurora

Aurora es el sistema de logging y observabilidad integrado. El núcleo es silencioso por defecto y no impone versiones de React ni de las herramientas visuales a la aplicación anfitriona. Pino procesa los eventos canónicos; Consola y las herramientas de terminal presentan esos eventos sin introducir un segundo motor de logging.

Instala las dependencias opcionales del perfil que utilizarás desde [Aurora installation](docs/aurora-installation.md).

```ts
import { Manager } from 'nyxlink';
import { createAuroraPipeline } from 'nyxlink/aurora';

const aurora = createAuroraPipeline({
  format: 'aurora',
  level: 'info',
});

const manager = new Manager({
  nodes,
  options: {
    logging: { level: aurora.level, target: aurora.target },
  },
});

aurora.banner(manager);
// Registra el conector de Discord y utiliza el manager en tu aplicación.

// Al cerrar la aplicación:
await manager.shutdown();
await aurora.close();
```

| Entrada | Función |
| --- | --- |
| `nyxlink/aurora` | Destinos Aurora, Pretty, JSON, Custom y Silent. |
| `nyxlink/aurora/bootstrap` | Medición de inicialización y disponibilidad. |
| `nyxlink/aurora/diagnostics` | Diagnósticos, tablas y vista musical. |
| `nyxlink/aurora/inspector` | Inspector interactivo Ink, eventos, spans y snapshots. |
| `nyxlink/aurora/file` | NDJSON privado, admisión acotada y cierre controlado. |
| `nyxlink/aurora/otel` | Correlación de eventos y spans. |
| `nyxlink/aurora/sdk` | SDK OpenTelemetry opcional, administrado por la aplicación. |

```sh
npx nyxlink-aurora --scenario all --snapshot
```

La demostración usa eventos simulados. La API de logging acepta `options.logging`; las antiguas clases Logger y el alias `options.aurora` ya no forman parte de la API.

## 📡 Eventos

| Evento | Descripción |
| --- | --- |
| `nodeReady` | Sesión del nodo disponible. |
| `nodeError` | Error del nodo o transporte. |
| `nodeDisconnect` | Conexión cerrada. |
| `nodeResume` | Reanudación de sesión confirmada. |
| `trackStart` | Inicio de pista notificado por el nodo. |
| `trackException` | Error de reproducción. |
| `queueEnd` | Cola agotada. |
| `autoPlayed` | Reproducción automática aceptada. |
| `playerNodeFailover` | Progreso, recuperación o fallo de migración. |
| `mixStart` / `mixEnd` | Eventos nativos de capas de audio. |
| `sponsorBlockEvent` | Observación normalizada de segmentos o capítulos. |
| `playerDestroy` | Reproductor destruido. |

Todos los eventos y argumentos se definen en [IManagerEvents](src/typings/Interfaces.ts) y en la [referencia de API generada](docs/api-generated.md).

<a name="documentacion"></a>

## 📚 Documentación

| Guía | Contenido |
| --- | --- |
| [API](docs/api-reference.md) · [Tipos y exports](docs/api-generated.md) | Contratos públicos, lifecycle y declaraciones. |
| [JavaScript](examples/discordjs.cjs) · [TypeScript](examples/discordjs.ts) | Integraciones con Discord.js. |
| [Backends](docs/backend-compatibility.md) · [Nodos](docs/node-selection.md) | Compatibilidad, capacidades y recuperación. |
| [NodeLink](docs/nodelink.md) · [Lavalink](docs/lavalink.md) | APIs específicas, streaming y plugins. |
| [Mixer](docs/mixer.md) · [Extensiones](docs/extensions.md) | Funciones opcionales y contratos tipados. |
| [Redis](docs/redis-storage.md) · [Métricas](docs/private-metrics.md) | Persistencia, control distribuido y observabilidad. |
| [Aurora](docs/aurora-installation.md) · [Logging](docs/logging-guide.md) · [OpenTelemetry](docs/aurora-observability.md) | Instalación y runtime de diagnóstico. |
| [Migración desde Moonlink](docs/migrating-from-moonlink.md) | Cambios de API y comportamiento. |
| [Changelog](CHANGELOG.md) | Historial de cambios. |

## 🛠️ Desarrollo

```sh
git clone https://github.com/SebasLoadJs/NyxLink.git
cd NyxLink
corepack pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run test:types
pnpm run test:package
pnpm run pack:check
```

Los tests de integración de backends y plugins requieren Linux y Docker o Podman. Consulta los [resultados de CI de dev](https://github.com/SebasLoadJs/NyxLink/actions?query=branch%3Adev), la [matriz de compatibilidad](docs/backend-compatibility.md) y la [aceptación de audio real](docs/pending-real-world-acceptance.md). Los contratos implementados en desarrollo no implican que todos los proveedores estén operativos ni que exista una versión estable publicada.

## 📄 Licencia

Mantenido por [SebasLoadJs](https://github.com/SebasLoadJs), bajo la licencia [OSL-3.0](LICENSE).

Derivado de [Moonlink.js](https://github.com/Ecliptia/moonlink.js), de 1Lucas1apk y sus colaboradores. Las atribuciones y modificaciones se conservan en [NOTICE.md](NOTICE.md).

<p align="center">
  <a href="https://github.com/SebasLoadJs/NyxLink/issues">Issues</a> ·
  <a href="https://github.com/SebasLoadJs/NyxLink/releases">Releases</a> ·
  <a href="https://www.npmjs.com/package/nyxlink">npm</a>
</p>
