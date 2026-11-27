const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BASE = 'https://maven.lavalink.dev/releases/';
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const releasePins = require('../integration/lavalink-plugin-matrix.json');

class PluginIntegrityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PluginIntegrityError';
    this.code = code;
  }
}

function jarUrl(plugin) {
  if (!plugin || typeof plugin !== 'object' || !/^[a-z][a-z0-9-]*$/.test(plugin.name) ||
      !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(plugin.version) ||
      !/^[a-f0-9]{64}$/.test(plugin.sha256)) {
    throw new PluginIntegrityError('PLUGIN_INVALID_PIN');
  }
  if (plugin.repository !== undefined) {
    const pinned = Object.values(releasePins).find(p => p.name === plugin.name && p.repository === plugin.repository && p.version === plugin.version);
    if (!pinned || pinned.sha256 !== plugin.sha256 || pinned.size !== plugin.size || pinned.advertised !== plugin.advertised) throw new PluginIntegrityError('PLUGIN_INVALID_RELEASE_PIN');
    const filename = plugin.name + '-' + plugin.version + '.jar';
    return {url:'https://github.com/' + pinned.repository + '/releases/download/' + pinned.version + '/' + filename, filename};
  }
  const parts = plugin.dependency?.split(':');
  if (!parts || parts.length !== 3 ||
      !['com.github.topi314.lavalyrics', 'com.github.topi314.sponsorblock'].includes(parts[0]) ||
      parts[1] !== plugin.name || parts[2] !== plugin.version) {
    throw new PluginIntegrityError('PLUGIN_INVALID_COORDINATES');
  }
  const filename = plugin.name + '-' + plugin.version + '.jar';
  const url = new URL(parts[0].replaceAll('.', '/') + '/' + plugin.name + '/' +
    plugin.version + '/' + filename, BASE);
  return { url: url.href, filename };
}

async function verifiedJar(plugin, fetcher = fetch) {
  let { url } = jarUrl(plugin);
  let response;
  for (let n = 0; n <= MAX_REDIRECTS; n++) {
    try {
      response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(45000) });
    } catch {
      throw new PluginIntegrityError('PLUGIN_ARTIFACT_DOWNLOAD_FAILED');
    }
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get('location');
    if (!location || n === MAX_REDIRECTS) throw new PluginIntegrityError('PLUGIN_ARTIFACT_REDIRECT_REJECTED');
    const target = new URL(location, url);
    const releaseHost = plugin.repository !== undefined && ['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(target.hostname);
    if (target.protocol !== 'https:' || target.username || target.password || target.port ||
        (plugin.repository !== undefined ? !releaseHost : target.origin !== new URL(BASE).origin)) {
      throw new PluginIntegrityError('PLUGIN_ARTIFACT_REDIRECT_REJECTED');
    }
    await response.body?.cancel();
    url = target.href;
  }
  if (!response.ok || !response.body) throw new PluginIntegrityError('PLUGIN_ARTIFACT_DOWNLOAD_FAILED');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BYTES) {
    await response.body.cancel();
    throw new PluginIntegrityError('PLUGIN_ARTIFACT_TOO_LARGE');
  }
  const chunks = [];
  let bytes = 0;
  const hash = createHash('sha256');
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new PluginIntegrityError('PLUGIN_ARTIFACT_TOO_LARGE');
      hash.update(value);
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof PluginIntegrityError) throw error;
    throw new PluginIntegrityError('PLUGIN_ARTIFACT_DOWNLOAD_FAILED');
  } finally {
    reader.releaseLock();
  }
  const sha256 = hash.digest('hex');
  if (!bytes || (plugin.size !== undefined && bytes !== plugin.size) || sha256 !== plugin.sha256) throw new PluginIntegrityError('PLUGIN_ARTIFACT_HASH_MISMATCH');
  return { bytes: Buffer.concat(chunks), sha256 };
}

/** Verify all JARs before writing any; Lavalink never sees an unverified artifact. */
async function installVerifiedPlugins(directory, plugins, fetcher = fetch) {
  if (!Array.isArray(plugins) || plugins.length < 1 || plugins.length > 8 || new Set(plugins.map(p=>p?.name)).size !== plugins.length) throw new PluginIntegrityError('PLUGIN_INVALID_PINS');
  const all = [];
  for (const plugin of plugins) {
    const { filename } = jarUrl(plugin);
    const artifact = await verifiedJar(plugin, fetcher);
    all.push({ filename, ...artifact });
  }
  const saved = [];
  try {
    for (const item of all) {
      await fs.writeFile(path.join(directory, item.filename), item.bytes, { mode: 0o600, flag: 'wx' });
      saved.push(item.filename);
    }
  } catch {
    await Promise.all(saved.map(name => fs.rm(path.join(directory, name), { force: true })));
    throw new PluginIntegrityError('PLUGIN_ARTIFACT_INSTALL_FAILED');
  }
  return all.map(({ filename, sha256 }) => ({ file: filename, sha256 }));
}

module.exports = { jarUrl, verifiedJar, installVerifiedPlugins, PluginIntegrityError };
