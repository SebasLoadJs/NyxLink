const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Manager } = require('../dist');
const { event } = require('../tests/helpers/v4-server.cjs');
const { withLavalinkPluginLab, PluginLabFailure } = require('../tests/helpers/lavalink-plugin-lab.cjs');

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
  let stage = 'NODE_CONNECT';
  const guildId = '923456789012345678';
  try {
    const ready = event(manager, 'nodeReady', 20000);
    await manager.init('823456789012345678');
    [node] = await ready;
    stage = 'PLUGIN_DETECTION';
    assert.equal(node.backend?.kind, 'lavalink');
    assert.equal(node.backend?.version, context.node.version);
    assert.ok(node.backend.getPlugin('lavalyrics-plugin') || node.backend.getPlugin('lavalyrics'));
    assert.ok(node.backend.getPlugin('sponsorblock-plugin') || node.backend.getPlugin('sponsorblock'));
    checks.push('both pinned plugins advertised through real /v4/info and detected by NyxLink');

    stage = 'TRACK_LOAD';
    const loaded = await node.rest.loadTracks(context.mediaUrl);
    assert.equal(loaded?.loadType, 'track');
    assert.equal(typeof loaded.data?.encoded, 'string');
    checks.push('generated authorized WAV source decoded by real Lavalink');

    // LavaLyrics 1.1.0 throws "No lyrics managers registered" when no
    // provider module is installed. The official REST contract documents
    // 204 for "not found", which is a distinct provider-configured case.
    // Accept only that known server-side missing-provider 500 or the
    // future-compatible 204, and never claim fetched lyrics.
    stage = 'LYRICS_NO_PROVIDER';
    let noProviderOutcome = 'none';
    try {
      const lyrics = await node.getLavaLyrics(loaded.data.encoded);
      assert.equal(lyrics, null);
      assert.equal(node.backend.featureStatus('lavalyrics'), 'available');
      noProviderOutcome = 'no-content-204';
    } catch (error) {
      if (error?.statusCode !== 500) throw error;
      assert.equal(node.backend.featureStatus('lavalyrics'), 'unknown');
      noProviderOutcome = 'no-registered-managers-500';
    }
    checks.push('installed LavaLyrics no-provider response: ' + noProviderOutcome +
      ' (no fetched lyrics certified)');

    // Create a non-playing backend player, not a voice connection.
    stage = 'PLAYER_CREATE';
    const acknowledgement = await node.rest.updatePlayer(guildId, { volume: 0, paused: true });
    assert.ok(acknowledgement);
    // SponsorBlock 3.0.1 stores no guild entry until PUT. In that
    // revision GET before PUT and GET after DELETE explicitly return 404
    // "Guild not found", not an empty JSON array.
    stage = 'SPONSORBLOCK_GET';
    await assert.rejects(node.getLavalinkSponsorBlockCategories(guildId),
      error => error?.statusCode === 404);
    stage = 'SPONSORBLOCK_PUT';
    await node.setLavalinkSponsorBlockCategories(guildId, ['sponsor', 'selfpromo']);
    const categories = await node.getLavalinkSponsorBlockCategories(guildId);
    assert.deepEqual([...categories].sort(), ['selfpromo', 'sponsor'].sort());
    stage = 'SPONSORBLOCK_DELETE';
    await node.clearLavalinkSponsorBlockCategories(guildId);
    await assert.rejects(node.getLavalinkSponsorBlockCategories(guildId),
      error => error?.statusCode === 404);
    assert.equal(node.backend.featureStatus('lavalink:sponsorblock'), 'available');
    checks.push('installed SponsorBlock missing guild 404, PUT/GET and DELETE/404 on non-playing player');

    stage = 'LIFECYCLE';
    assert.equal(errors.length, 0, 'Unexpected backend lifecycle error during plugin lab');
    return {
      passed: true, image: context.image, plugins: context.versions, jars: context.jars,
      checks, realPluginServer: true, discordVoice: false, audibleSkipping: false,
      providersConfigured: false
    };
  } catch (error) {
    if (error instanceof PluginLabFailure) throw error;
    if (stage === 'LYRICS_NO_PROVIDER') {
      if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599) {
        throw new PluginLabFailure('PLUGIN_LYRICS_HTTP_' + error.statusCode);
      }
      if (error?.code === 'INVALID_PROTOCOL_RESPONSE') {
        throw new PluginLabFailure('PLUGIN_LYRICS_INVALID_RESPONSE');
      }
      if (error?.code === 'ERR_ASSERTION') {
        throw new PluginLabFailure('PLUGIN_LYRICS_UNEXPECTED_RESULT');
      }
    }
    throw new PluginLabFailure('PLUGIN_' + stage + '_FAILED');
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
      stage: 'plugin-lab', errorCode: error instanceof PluginLabFailure ? error.code : 'PLUGIN_LAB_FAILED' };
  }
  const destination = path.resolve('.runtime/lavalink-plugins/latest-report.json');
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.writeFile(destination, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks?.length ?? 0,
    scope: report.scope, errorCode: report.errorCode ?? null, report: '.runtime/lavalink-plugins/latest-report.json' }));
  if (!report.passed) process.exitCode = 1;
})().catch(() => { console.error('Plugin lab infrastructure failed'); process.exitCode = 1; });
