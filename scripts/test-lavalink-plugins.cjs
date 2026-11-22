const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Manager } = require('../dist');
const { event } = require('../tests/helpers/v4-server.cjs');
const { withLavalinkPluginLab } = require('../tests/helpers/lavalink-plugin-lab.cjs');

async function verify(context) {
  const checks = [];
  const manager = new Manager({
    nodes: [context.node],
    send() { throw new Error('Discord gateway is intentionally unavailable in the plugin lab'); },
    options: { database: { type: 'memory' }, resume: false }
  });
  const errors = [];
  manager.on('nodeError', (_node, error) => errors.push(error));
  let node;
  const guildId = '923456789012345678';
  try {
    const ready = event(manager, 'nodeReady', 20000);
    await manager.init('823456789012345678');
    [node] = await ready;
    assert.equal(node.backend?.kind, 'lavalink');
    assert.equal(node.backend?.version, context.node.version);
    assert.ok(node.backend.getPlugin('lavalyrics-plugin') || node.backend.getPlugin('lavalyrics'));
    assert.ok(node.backend.getPlugin('sponsorblock-plugin') || node.backend.getPlugin('sponsorblock'));
    checks.push('both pinned plugins advertised through real /v4/info and detected by NyxLink');

    const loaded = await node.rest.loadTracks(context.mediaUrl);
    assert.equal(loaded?.loadType, 'track');
    assert.equal(typeof loaded.data?.encoded, 'string');
    checks.push('generated authorized WAV source decoded by real Lavalink');

    // No external provider is enabled in the fixture. This must return the
    // documented no-content result, never synthetic or scraped lyric content.
    const lyrics = await node.getLavaLyrics(loaded.data.encoded);
    assert.equal(lyrics, null);
    assert.equal(node.backend.featureStatus('lavalyrics'), 'available');
    checks.push('installed LavaLyrics returns an empty-provider result without Discord');

    // Create a non-playing backend player, not a voice connection.
    const acknowledgement = await node.rest.updatePlayer(guildId, { volume: 0, paused: true });
    assert.ok(acknowledgement);
    assert.deepEqual(await node.getLavalinkSponsorBlockCategories(guildId), []);
    await node.setLavalinkSponsorBlockCategories(guildId, ['sponsor', 'selfpromo']);
    const categories = await node.getLavalinkSponsorBlockCategories(guildId);
    assert.deepEqual([...categories].sort(), ['selfpromo', 'sponsor'].sort());
    await node.clearLavalinkSponsorBlockCategories(guildId);
    assert.deepEqual(await node.getLavalinkSponsorBlockCategories(guildId), []);
    assert.equal(node.backend.featureStatus('lavalink:sponsorblock'), 'available');
    checks.push('installed SponsorBlock GET/PUT/DELETE round-trip on non-playing player');

    assert.equal(errors.length, 0, 'Unexpected backend lifecycle error during plugin lab');
    return {
      passed: true, image: context.image, plugins: context.versions, jars: context.jars,
      checks, realPluginServer: true, discordVoice: false, audibleSkipping: false,
      providersConfigured: false
    };
  } finally {
    if (node?.connected) await node.rest.destroyPlayer(guildId).catch(() => {});
    await manager.shutdown();
  }
}

(async () => {
  let report;
  try {
    const result = await withLavalinkPluginLab(verify);
    report = { timestamp: new Date().toISOString(),
      scope: 'real digest-pinned Lavalink with installed plugin jars, no Discord voice',
      ...result };
  } catch (error) {
    // Do not log or persist arbitrary remote exception text; it may contain
    // server passwords, request headers, or user-controlled track URLs.
    report = { timestamp: new Date().toISOString(),
      scope: 'real Lavalink plugin integration without Discord voice', passed: false,
      stage: 'plugin-lab', errorCode: error?.code === 'ERR_ASSERTION' ? 'ASSERTION_FAILED' : 'PLUGIN_LAB_FAILED' };
  }
  const destination = path.resolve('.runtime/lavalink-plugins/latest-report.json');
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.writeFile(destination, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks?.length ?? 0,
    scope: report.scope, errorCode: report.errorCode ?? null, report: '.runtime/lavalink-plugins/latest-report.json' }));
  if (!report.passed) process.exitCode = 1;
})().catch(() => { console.error('Plugin lab infrastructure failed'); process.exitCode = 1; });
