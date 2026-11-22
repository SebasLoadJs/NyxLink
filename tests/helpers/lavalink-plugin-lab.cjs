const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { randomBytes, createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const pins = require('../integration/backend-servers.json');

const exec = promisify(execFile);
const profile = pins.lavalinkPlugins;

function validateProfile(value = profile) {
  assert.equal(value.image, pins.lavalink.image, 'Plugin lab must reuse the immutable baseline Lavalink image');
  assert.match(value.image, /^ghcr\.io\/lavalink-devs\/lavalink@sha256:[a-f0-9]{64}$/);
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
  }
}

function renderConfig(port, password, value = profile) {
  validateProfile(value);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
  assert.match(password, /^[a-f0-9]{48}$/);
  const declarations = value.plugins.map(p => '    - dependency: "' + p.dependency + '"\n' +
    '      repository: "https://maven.lavalink.dev/releases"\n' +
    '      snapshot: false').join('\n');
  return [
    'server:', '  address: 127.0.0.1', '  port: ' + port,
    'lavalink:', '  pluginsDir: "/opt/Lavalink/plugins"', '  plugins:', declarations,
    '  server:', "    password: '" + password + "'",
    '    sources:', '      youtube: false', '      soundcloud: false',
    '      bandcamp: false', '      twitch: false', '      vimeo: false',
    '      nico: false', '      http: true', '      local: false',
    'plugins:', '  lavalyrics:', '    sources: []',
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

async function withLavalinkPluginLab(run) {
  validateProfile();
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
  const media = wav();
  const server = http.createServer((req, res) => {
    if (req.url !== '/tone.wav' || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404); res.end(); return;
    }
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), media.length - 1) : media.length - 1;
    if (start >= media.length || start > end) {
      res.writeHead(416); res.end(); return;
    }
    res.writeHead(match ? 206 : 200, {
      'content-type': 'audio/wav',
      'content-length': end - start + 1,
      'accept-ranges': 'bytes',
      ...(match ? { 'content-range': 'bytes ' + start + '-' + end + '/' + media.length } : {})
    });
    res.end(req.method === 'HEAD' ? undefined : media.subarray(start, end + 1));
  });
  let containerStarted = false;
  let serverStarted = false;
  try {
    const mediaPort = await openPort(server);
    serverStarted = true;
    await fs.writeFile(config, renderConfig(port, password), { mode: 0o600, flag: 'wx' });
    await command(['run', '-d', '--name', name, '--user',
      String(process.getuid()) + ':' + String(process.getgid()),
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--network', 'host', '--memory', '1024m', '--cpus', '2', '--pids-limit', '256',
      '-v', config + ':/opt/Lavalink/application.yml:ro',
      '-v', pluginsDir + ':/opt/Lavalink/plugins:rw',
      '-e', 'JAVA_TOOL_OPTIONS=-Xms64m -Xmx512m', profile.image]);
    containerStarted = true;

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
    if (!info) throw new Error('Pinned Lavalink with configured plugins failed to start');
    const actual = (info.plugins || []).map(p => String(p.name || '').toLowerCase());
    for (const plugin of profile.plugins) {
      const short = plugin.name.replace(/-plugin$/, '');
      if (!actual.includes(plugin.name) && !actual.includes(short)) {
        throw new Error('Expected plugin was not advertised: ' + plugin.name);
      }
    }
    const jars = [];
    for (const filename of await fs.readdir(pluginsDir)) {
      if (!filename.endsWith('.jar')) continue;
      const bytes = await fs.readFile(path.join(pluginsDir, filename));
      jars.push({ file: filename, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    return await run({
      node: { identifier: 'lavalink-plugins', host: '127.0.0.1', port,
        password, secure: false, version: info.version.semver },
      mediaUrl: 'http://127.0.0.1:' + mediaPort + '/tone.wav',
      image: profile.image,
      versions: profile.plugins.map(p => ({ name: p.name, version: p.version })),
      jars
    });
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

module.exports = { validateProfile, renderConfig, withLavalinkPluginLab };
