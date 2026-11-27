const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { installVerifiedPlugins, PluginIntegrityError } = require('./verified-plugin-jars.cjs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const pins = require('../integration/backend-servers.json');

const exec = promisify(execFile);
const profile = pins.lavalinkPlugins;
const matrix = require('../integration/lavalink-plugin-matrix.json');
function matrixProfile(id) {
  assert.ok(Object.hasOwn(matrix,id),'Unknown plugin matrix profile');
  const plugins = id === 'java-lavalyrics' ? [{...pins.lavalinkPlugins.plugins[0]},{...matrix[id]}] : [{...matrix[id]}];
  return { image:pins.lavalink.image, plugins, matrix:id };
}

function validateProfile(value = profile) {
  assert.equal(value.image, pins.lavalink.image, 'Plugin lab must reuse the immutable baseline Lavalink image');
  assert.match(value.image, /^ghcr\.io\/lavalink-devs\/lavalink@sha256:[a-f0-9]{64}$/);
  if (value.matrix !== undefined) {
    assert.ok(Object.hasOwn(matrix,value.matrix),'Unknown matrix profile');
    assert.deepEqual(value.plugins,matrixProfile(value.matrix).plugins);
    return;
  }
  assert.equal(value.plugins.length, 2);
  const expected = [
    ['lavalyrics-plugin', 'com.github.topi314.lavalyrics'],
    ['sponsorblock-plugin', 'com.github.topi314.sponsorblock']
  ];
  for (let i = 0; i < expected.length; i++) {
    const plugin = value.plugins[i];
    assert.equal(plugin.name, expected[i][0]);
    assert.match(plugin.version, /^[0-9]+\.[0-9]+\.[0-9]+$/);
    assert.equal(plugin.dependency, expected[i][1] + ':' + plugin.name + ':' + plugin.version);
    assert.match(plugin.sha256, /^[a-f0-9]{64}$/);
  }
}

function renderConfig(port, password, value = profile) {
  validateProfile(value);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
  assert.match(password, /^[a-f0-9]{48}$/);
  const pluginConfig = value.matrix === 'youtube' ? ['  youtube:', '    enabled: true', '    clients: [WEB]', '    allowSearch: false'] : value.matrix === 'lavasrc' ? ['  lavasrc:', '    sources:', ...['spotify','applemusic','deezer','yandexmusic','flowerytts','youtube','vkmusic','tidal','qobuz','ytdlp','jiosaavn'].map(s=>'      '+s+': false'), '    lyrics-sources:', ...['spotify','deezer','youtube','yandexmusic','vkmusic','lrcLib'].map(s=>'      '+s+': false')] : value.matrix === 'dunctebot' ? ['  dunctebot:', '    sources:', ...['getyarn','clypit','tts','pornhub','reddit','ocremix','tiktok','mixcloud','soundgasm','pixeldrain','tumblr'].map(s=>'      '+s+': false')] : value.matrix === 'xm' ? ['  xm:', '    ampFactor: 1'] : value.matrix === 'java-lyrics' || value.matrix === 'java-lavalyrics' ? ['  lyrics:', '    countryCode: US'] : ['  lavalyrics:', '    sources: []'];
  return [
    'server:', '  address: 127.0.0.1', '  port: ' + port,
    'lavalink:', '  pluginsDir: "/opt/Lavalink/plugins"',
    '  server:', "    password: '" + password + "'",
    '    sources:', '      youtube: false', '      soundcloud: false',
    '      bandcamp: false', '      twitch: false', '      vimeo: false',
    '      nico: false', '      http: true', '      local: false',
    'plugins:', ...pluginConfig,
    'logging:', '  level:', '    root: WARN', ''
  ].join('\n');
}

function wav() {
  const samples = 48000;
  const data = Buffer.alloc(44 + 2 * samples);
  data.write('RIFF', 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22); data.writeUInt32LE(48000, 24);
  data.writeUInt32LE(96000, 28); data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34); data.write('data', 36);
  data.writeUInt32LE(data.length - 44, 40);
  for (let n = 0; n < samples; n++) {
    data.writeInt16LE(Math.round(Math.sin(n * 2 * Math.PI * 440 / 48000) * 2000), 44 + n * 2);
  }
  return data;
}

/** Original generated ProTracker module: one pattern, one looping sine-wave sample. */
function trackerModule() {
  const data=Buffer.alloc(1084+1024+64);
  data.write('NyxLink fixture',0,'ascii');
  data.write('Generated sine',20,'ascii');
  data.writeUInt16BE(32,42);
  data[45]=32;
  data.writeUInt16BE(32,48);
  data[950]=1;
  data.write('M.K.',1080,'ascii');
  const period=428;
  data[1084]=period>>8;
  data[1085]=period&255;
  data[1086]=0x10;
  for(let i=0;i<64;i++) data.writeInt8(Math.round(Math.sin(i*Math.PI/32)*64),2108+i);
  return data;
}

async function openPort(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function nextPort() {
  const socket = net.createServer();
  const port = await openPort(socket);
  await new Promise(resolve => socket.close(resolve));
  return port;
}


function startupErrorCode(logs) {
  if (/accessdeniedexception|permission denied|eacces/i.test(logs)) return 'PLUGIN_DIRECTORY_PERMISSION';
  if (/could not resolve|failed to download|could not find artifact|unresolved dependency|failed to transfer|unable to resolve/i.test(logs)) return 'PLUGIN_ARTIFACT_RESOLUTION';
  if (/UnsupportedClassVersionError|unsupported class file major/i.test(logs)) return 'JAVA_RUNTIME_INCOMPATIBLE';
  if (/failed to load plugin|plugin .* failed to load|plugin initialization failure/i.test(logs)) return 'PLUGIN_LOAD_FAILURE';
  if (/address already in use|failed to bind/i.test(logs)) return 'SERVER_PORT_CONFLICT';
  return 'LAVALINK_START_FAILURE';
}
class PluginLabFailure extends Error {
  constructor(code) { super(code); this.name = 'PluginLabFailure'; this.code = code; }
}

async function withLavalinkPluginLab(run, selectedProfile = profile) {
  validateProfile(selectedProfile);
  if (process.platform !== 'linux' || typeof process.getuid !== 'function') {
    throw new Error('Real plugin lab requires a Linux container host');
  }
  const engine = process.env.NYXLINK_CONTAINER_ENGINE || 'docker';
  if (!['docker', 'podman'].includes(engine)) throw new Error('Unsupported container engine');
  const command = args => exec(engine, args, { timeout: 120000, maxBuffer: 1024 * 1024 });
  const root = path.resolve(__dirname, '../..');
  const runtime = path.join(root, '.runtime', 'lavalink-plugins');
  await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
  const directory = await fs.mkdtemp(path.join(runtime, 'run-'));
  const pluginsDir = path.join(directory, 'plugins');
  await fs.mkdir(pluginsDir, { mode: 0o700 });
  const password = randomBytes(24).toString('hex');
  const port = await nextPort();
  const config = path.join(directory, 'application.yml');
  const name = 'nyxlink-plugins-' + process.pid + '-' + randomBytes(4).toString('hex');
  const wave = wav(), module = trackerModule();
  const server = http.createServer((req, res) => {
    if (!['/tone.wav','/fixture.mod'].includes(req.url) || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404); res.end(); return;
    }
    const media=req.url === '/fixture.mod' ? module : wave;
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), media.length - 1) : media.length - 1;
    if (start >= media.length || start > end) {
      res.writeHead(416); res.end(); return;
    }
    res.writeHead(match ? 206 : 200, {
      'content-type': req.url === '/fixture.mod' ? 'application/octet-stream' : 'audio/wav',
      'content-length': end - start + 1,
      'accept-ranges': 'bytes',
      ...(match ? { 'content-range': 'bytes ' + start + '-' + end + '/' + media.length } : {})
    });
    res.end(req.method === 'HEAD' ? undefined : media.subarray(start, end + 1));
  });
  let containerStarted = false;
  let serverStarted = false;
  let phase = 'SETUP';
  try {
    const mediaPort = await openPort(server);
    serverStarted = true;
    await fs.writeFile(config, renderConfig(port, password, selectedProfile), { mode: 0o600, flag: 'wx' });
    phase = 'ARTIFACT_VERIFY';
    const jars = await installVerifiedPlugins(pluginsDir, selectedProfile.plugins);
    phase = 'CONTAINER_CREATE';
    await command(['run', '-d', '--name', name, '--user',
      String(process.getuid()) + ':' + String(process.getgid()),
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--network', 'host', '--memory', '1024m', '--cpus', '2', '--pids-limit', '256',
      '-v', config + ':/opt/Lavalink/application.yml:ro',
      '-v', pluginsDir + ':/opt/Lavalink/plugins:ro',
      '-e', 'JAVA_TOOL_OPTIONS=-Xms64m -Xmx512m', selectedProfile.image]);
    containerStarted = true;
    phase = 'BACKEND_START';

    let info;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/v4/info', {
          headers: { Authorization: password }, signal: AbortSignal.timeout(2000)
        });
        if (response.ok) { info = await response.json(); break; }
      } catch {}
      const result = await command(['inspect', '--format', '{{.State.Status}}', name]);
      if (result.stdout.trim() !== 'running') break;
      await delay(400);
    }
    if (!info) {
      const logs = await command(['logs', '--tail', '100', name]).catch(() => ({ stdout: '' }));
      throw new PluginLabFailure(startupErrorCode(logs.stdout));
    }
    phase = 'PLUGIN_INVENTORY';
    const actual = (info.plugins || []).map(p => String(p.name || '').toLowerCase());
    for (const plugin of selectedProfile.plugins) {
      const advertised = (plugin.advertised ?? plugin.name).toLowerCase();
      const short = advertised.replace(/-plugin$/, '');
      if (!actual.includes(advertised) && !actual.includes(short)) {
        throw new Error('Expected plugin was not advertised: ' + plugin.name);
      }
    }
    phase = 'ACCEPTANCE';
    return await run({
      node: { identifier: 'lavalink-plugins', host: '127.0.0.1', port,
        password, secure: false, version: info.version.semver },
      mediaUrl: 'http://127.0.0.1:' + mediaPort + '/tone.wav',
      moduleUrl: 'http://127.0.0.1:' + mediaPort + '/fixture.mod',
      image: selectedProfile.image,
      versions: selectedProfile.plugins.map(p => ({ name: p.advertised ?? p.name, version: p.version })),
      jars
    });
  } catch (error) {
    if (error instanceof PluginLabFailure) throw error;
    if (error instanceof PluginIntegrityError) throw new PluginLabFailure(error.code);
    const reason = ({
      SETUP: 'PLUGIN_LAB_SETUP_FAILED',
      ARTIFACT_VERIFY: 'PLUGIN_ARTIFACT_INTEGRITY_FAILED',
      CONTAINER_CREATE: 'PLUGIN_CONTAINER_CREATE_FAILED',
      BACKEND_START: 'PLUGIN_BACKEND_START_FAILED',
      PLUGIN_INVENTORY: 'PLUGIN_INFO_MISMATCH',
      ACCEPTANCE: 'PLUGIN_ACCEPTANCE_FAILED'
    })[phase];
    throw new PluginLabFailure(reason || 'PLUGIN_LAB_FAILED');
  } finally {
    if (containerStarted) {
      await command(['stop', '--time', '3', name]).catch(() => {});
      await command(['rm', '--force', name]).catch(() => {});
    }
    if (serverStarted) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { trackerModule, matrixProfile, validateProfile, renderConfig, startupErrorCode, PluginLabFailure, withLavalinkPluginLab };
