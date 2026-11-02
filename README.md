<p align="center">
  <img src="https://raw.githubusercontent.com/melodiabl/NyxLink/dev/assets/nyxlink_banner.png" alt="NyxLink" width="100%">
</p>

# NyxLink

Cliente de **Lavalink v4 y NodeLink** para bots de Discord, escrito en TypeScript y disponible para JavaScript y TypeScript.

[Paquete npm](https://www.npmjs.com/package/nyxlink) · [GitHub](https://github.com/melodiabl/NyxLink) · [Reportar un problema](https://github.com/melodiabl/NyxLink/issues)

## Instalación

Requiere **Node.js 22.12 o superior**. Versión de desarrollo actual: **0.1.0-dev.1**.

```sh
npm install nyxlink@dev
```

Para fijar la versión:

```sh
npm install nyxlink@0.1.0-dev.1
```

## Uso con Discord.js

El ejemplo utiliza Discord.js 14. Instálalo en tu bot con `npm install discord.js` y configura `DISCORD_TOKEN` y `AUDIO_NODE_PASSWORD` en tu entorno.

```js
const { Client, GatewayIntentBits } = require('discord.js');
const { Manager, Connectors } = require('nyxlink');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const manager = new Manager({
  nodes: [{
    identifier: 'principal',
    host: process.env.AUDIO_NODE_HOST ?? '127.0.0.1',
    port: Number(process.env.AUDIO_NODE_PORT ?? 2333),
    password: process.env.AUDIO_NODE_PASSWORD,
    secure: false,
  }],
  options: { database: { type: 'memory' }, resume: false },
});

manager.use(new Connectors.DiscordJs(), client);
manager.on('nodeReady', node => console.log(`Nodo conectado: ${node.identifier}`));
manager.on('nodeError', (_node, error) => console.error(error.message));

client.login(process.env.DISCORD_TOKEN);
```

Espera el evento `nodeReady` antes de buscar o reproducir pistas. Los ejemplos completos de búsqueda, cola y cierre están en [JavaScript](examples/discordjs.cjs) y [TypeScript](examples/discordjs.ts).

## API principal

- `manager.search({ query, requester })`: buscar pistas.
- `manager.players.create({ guildId, voiceChannelId })`: crear un reproductor.
- `player.queue.add(track)`: añadir una pista a la cola.
- `await player.play()`: iniciar la reproducción; devuelve si el backend aceptó la operación.
- `await player.stop()`: detener la reproducción.
- `await player.setVolumeAsync(50)`: cambiar el volumen esperando la respuesta del backend.
- `await manager.shutdown()`: cerrar los recursos de NyxLink.

## Desarrollo

```sh
git clone --branch dev https://github.com/melodiabl/NyxLink.git
cd NyxLink
corepack pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run test:types
pnpm run test:package
```

`src/` contiene el código TypeScript. `dist/` contiene el JavaScript compilado, las declaraciones de tipos y los mapas de código; se genera con `pnpm run build` y es la entrada del paquete npm. `tests/`, `scripts/` y `.github/` contienen las pruebas y su automatización.

## Licencia

Mantenido por [melodiabl](https://github.com/melodiabl). NyxLink deriva de Moonlink.js, de 1Lucas1.apk y sus colaboradores, y conserva la licencia [OSL-3.0](LICENSE) y los avisos de origen.
