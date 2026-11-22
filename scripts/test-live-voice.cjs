const { setTimeout: delay } = require('node:timers/promises');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const address = value => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !parsed.username && !parsed.password && !!parsed.hostname;
  } catch { return false; }
};

/** This module never logs in simply because it is imported or run without --armed. */
function validateConfiguration(env, argv) {
  if (!argv.includes('--armed')) throw new Error('Explicit --armed flag required; no network actions performed');
  const fields = [
    'NYXLINK_DISCORD_BOT_TOKEN', 'NYXLINK_DISCORD_GUILD_ID',
    'NYXLINK_DISCORD_VOICE_CHANNEL_ID', 'NYXLINK_NODE_HOST',
    'NYXLINK_NODE_PORT', 'NYXLINK_NODE_PASSWORD',
    'NYXLINK_LIVE_TRACK_A', 'NYXLINK_LIVE_TRACK_B'
  ];
  const missing = fields.filter(key => typeof env[key] !== 'string' || !env[key].trim());
  if (missing.length) throw new Error('Missing environment variables: ' + missing.join(', '));
  if (!snowflake(env.NYXLINK_DISCORD_GUILD_ID) || !snowflake(env.NYXLINK_DISCORD_VOICE_CHANNEL_ID)) {
    throw new Error('Guild/channel must be valid Discord snowflake IDs');
  }
  const port = Number(env.NYXLINK_NODE_PORT);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid NodeLink port');
  if (!/^[a-zA-Z0-9.-]+$/.test(env.NYXLINK_NODE_HOST)) throw new Error('Invalid NodeLink host');
  if (!address(env.NYXLINK_LIVE_TRACK_A) || !address(env.NYXLINK_LIVE_TRACK_B) ||
      env.NYXLINK_LIVE_TRACK_A === env.NYXLINK_LIVE_TRACK_B) throw new Error('Provide two different accessible HTTP(S) audio URLs');
  const crossfadeMs = env.NYXLINK_LIVE_CROSSFADE_MS === undefined ? 5000 : Number(env.NYXLINK_LIVE_CROSSFADE_MS);
  if (!Number.isSafeInteger(crossfadeMs) || crossfadeMs < 1000 || crossfadeMs > 15000) throw new Error('Crossfade duration must be 1000–15000 milliseconds');
  return {
    token: env.NYXLINK_DISCORD_BOT_TOKEN,
    guildId: env.NYXLINK_DISCORD_GUILD_ID,
    channelId: env.NYXLINK_DISCORD_VOICE_CHANNEL_ID,
    node: {
      identifier: 'live-voice-verification',
      host: env.NYXLINK_NODE_HOST,
      port,
      password: env.NYXLINK_NODE_PASSWORD,
      secure: env.NYXLINK_NODE_SECURE === 'true'
    },
    urls: [env.NYXLINK_LIVE_TRACK_A, env.NYXLINK_LIVE_TRACK_B],
    crossfadeMs
  };
}

function event(manager, name, matches, timeoutMs) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, args) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      manager.removeListener(name, handler);
      if (error) reject(error);
      else resolve(args);
    };
    const handler = (...args) => {
      try {
        if (matches(...args)) finish(null, args);
      } catch (error) {
        finish(error);
      }
    };
    const timer = setTimeout(() => finish(new Error('Timed out waiting for ' + name)), timeoutMs);
    manager.on(name, handler);
    cancel = () => finish(new Error('Cancelled waiting for ' + name));
  });
  // Login can fail before the caller awaits this promise. Do not create an
  // unhandled rejection while retaining the original rejection for the caller.
  void promise.catch(() => {});
  return { promise, cancel };
}

function errorCode(error) {
  // Never persist or log third-party error messages: they can contain
  // credentials, remote URLs, bearer headers, or encoded audio tracks.
  if (error instanceof TypeError) return 'TYPE_ERROR';
  if (error instanceof RangeError) return 'RANGE_ERROR';
  if (error instanceof SyntaxError) return 'SYNTAX_ERROR';
  return 'OPERATION_ERROR';
}

async function writePrivateReport(target, report) {
  const folder = path.dirname(target);
  await fs.mkdir(folder, { recursive: true });
  const temporary = path.join(folder, '.' + path.basename(target) + '.' + randomUUID() + '.tmp');
  try {
    // Create privately first and replace the final report atomically. Writing with
    // mode 0600 alone would not correct permissions on an existing report.
    await fs.writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function run(config) {
  const { Client, GatewayIntentBits } = require('discord.js');
  const { Manager, Connectors } = require('../dist');
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  const manager = new Manager({
    nodes: [config.node],
    options: { database: { type: 'memory' }, resume: false, voiceConnection: { timeout: 30000 } }
  });
  const events = [];
  const record = (type, extra = {}) => events.push({ type, at: new Date().toISOString(), ...extra });
  const report = {
    scope: 'opt-in real Discord gateway and voice integration',
    audioMeasured: false,
    operatorListeningRequired: true,
    observed: false,
    events
  };
  let player;
  let readyWait;
  let stage = 'initialization';
  manager.on('trackStart', (p, track) => {
    if (p.guildId === config.guildId) record('trackStart', { track: track.encoded === report.firstEncoded ? 'A' :
      track.encoded === report.secondEncoded ? 'B' : 'unexpected' });
  });
  manager.on('trackEnd', (p, track, reason) => {
    if (p.guildId === config.guildId) record('trackEnd', { reason, track: track.encoded === report.firstEncoded ? 'A' :
      track.encoded === report.secondEncoded ? 'B' : 'unexpected' });
  });
  manager.on('nodeError', (_node, error) => record('nodeError', { errorCode: errorCode(error) }));
  manager.use(new Connectors.DiscordJs(), client);
  try {
    readyWait = event(manager, 'nodeReady', n => n.identifier === config.node.identifier, 45000);
    stage = 'discord-login';
    await client.login(config.token);
    stage = 'node-ready';
    const [node] = await readyWait.promise;
    if (node.backend?.kind !== 'nodelink') throw new Error('Expected NodeLink backend');
    record('nodeReady', { version: node.backend.version });
    const tracks = [];
    stage = 'track-resolution';
    for (const url of config.urls) {
      const result = await manager.search({ query: url, node: node.identifier });
      const track = result.tracks?.[0];
      if (!track || track.getInfo().isStream || track.getInfo().length < config.crossfadeMs + 10000 ||
        track.getInfo().length > 120000) throw new Error('Both test tracks must be finite, 15–120s long and decodable');
      tracks.push(track);
    }
    if (tracks[0].encoded === tracks[1].encoded) throw new Error('Test tracks must be distinct');
    // Encoded strings are retained only for local event identity matching and omitted from the report.
    report.firstEncoded = tracks[0].encoded; report.secondEncoded = tracks[1].encoded;
    player = manager.players.create({
      guildId: config.guildId, voiceChannelId: config.channelId, autoPlay: false
    });
    stage = 'voice-connect';
    await player.connect();
    record('gatewayVoiceReady');
    stage = 'transition-configuration';
    await player.setCrossfade({ enabled: true, mode: 'smart', duration: config.crossfadeMs, curve: 'sinusoidal' });
    player.setQueuePreload({ enabled: true, leadMs: Math.min(35000, tracks[0].getInfo().length) });
    player.queue.add(tracks);
    stage = 'playback-start';
    const played = await player.play();
    if (!played) throw new Error('Backend did not accept initial playback');
    // Do not trust REST acknowledgement as evidence of voice audio.
    stage = 'handoff-observation';
    const expires = Date.now() + Math.min(240000, tracks[0].getInfo().length + 45000);
    while (Date.now() < expires) {
      const starts = events.filter(e => e.type === 'trackStart').map(e => e.track);
      if (starts.length >= 2) break;
      await delay(200);
    }
    await delay(2000);
    const starts = events.filter(e => e.type === 'trackStart').map(e => e.track);
    report.observed = starts.length === 2 && starts[0] === 'A' && starts[1] === 'B';
    report.transitionReasons = events.filter(e => e.type === 'trackEnd').map(e => e.reason);
    report.crossfadeEventObserved = report.transitionReasons.includes('crossfading');
    report.remainingQueue = player.queue.size;
    report.success = report.observed && report.remainingQueue === 0;
    if (!report.success) throw new Error('Two ordered TrackStart events and an empty queue were not observed');
    record('protocolSequencePassed');
  } catch (error) {
    report.success = false;
    report.errorCode = errorCode(error);
    report.failureStage = stage;
  } finally {
    // Cancel a pending nodeReady listener if Discord login failed or shutdown began.
    readyWait?.cancel();
    // Never persist bearer tokens, server URLs or encoded tracks to disk.
    delete report.firstEncoded;
    delete report.secondEncoded;
    try { if (player) await player.stop().catch(() => {}); } catch {}
    try { await manager.shutdown(); } catch {}
    client.destroy();
    const target = path.resolve('.runtime/live-voice/report.json');
    await writePrivateReport(target, report);
    console.log(JSON.stringify({ report: target, protocolPassed: report.success,
      crossfadeEventObserved: report.crossfadeEventObserved ?? false,
      audioMeasured: false, errorCode: report.errorCode, failureStage: report.failureStage }));
  }
  if (!report.success) process.exitCode = 1;
}

if (require.main === module) {
  try {
    const config = validateConfiguration(process.env, process.argv.slice(2));
    void run(config).catch(error => {
      console.error('Live voice test failed: ' + errorCode(error));
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateConfiguration, errorCode, event, writePrivateReport };
