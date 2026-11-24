const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { validateConfiguration, sourceRevision, writePrivateReport } = require('./test-live-voice.cjs');

const root = path.resolve(__dirname, '..');
const allowed = new Set(['NYXLINK_DISCORD_BOT_TOKEN', 'NYXLINK_DISCORD_GUILD_ID', 'NYXLINK_DISCORD_VOICE_CHANNEL_ID',
  'NYXLINK_NODE_HOST', 'NYXLINK_NODE_PORT', 'NYXLINK_NODE_PASSWORD', 'NYXLINK_NODE_SECURE',
  'NYXLINK_LIVE_TRACK_A', 'NYXLINK_LIVE_TRACK_B', 'NYXLINK_LIVE_CROSSFADE_MS', 'NYXLINK_LIVE_BACKEND']);
const scenarios = Object.freeze([
  { backend: 'nodelink', mode: 'commands', args: ['--commands'] },
  { backend: 'nodelink', mode: 'reconnect', args: ['--reconnect'] },
  { backend: 'nodelink', mode: 'crossfade', args: [] },
  { backend: 'lavalink', mode: 'commands', args: ['--commands'] },
  { backend: 'lavalink', mode: 'reconnect', args: ['--reconnect'] },
]);

/** A literal env format, never shell/JavaScript interpolation or evaluation. */
function parseEnvironment(content) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > 65536 || content.includes('\0')) throw new TypeError('Invalid live-test environment file');
  const values = Object.create(null);
  for (const original of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(NYXLINK_[A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match || !allowed.has(match[1]) || Object.hasOwn(values, match[1])) throw new TypeError('Unsupported or duplicate live-test environment field');
    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      if (value.length < 2 || value.at(-1) !== value[0]) throw new TypeError('Unclosed live-test environment quote');
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function parseArguments(args) {
  const result = { armed: false, files: {} };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new TypeError('Duplicate live-suite option');
    seen.add(flag);
    if (flag === '--armed') result.armed = true;
    else if (flag === '--check') { /* Safe default: local validation only. */ }
    else if (flag === '--nodelink-env' || flag === '--lavalink-env') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new TypeError('A private environment-file path is required');
      result.files[flag === '--nodelink-env' ? 'nodelink' : 'lavalink'] = value;
    } else throw new TypeError('Unknown live-suite option');
  }
  if (seen.has('--armed') && seen.has('--check')) throw new TypeError('Choose --check or --armed');
  if (!result.files.nodelink || !result.files.lavalink) throw new TypeError('Provide both --nodelink-env and --lavalink-env paths');
  return result;
}

async function runSuite(options, dependencies = {}) {
  const execute = dependencies.execute ?? spawnSync;
  const revision = dependencies.revision ?? sourceRevision;
  const configurations = {};
  for (const backend of ['nodelink', 'lavalink']) {
    // Read only explicit files. Never fill a missing bot token from inherited
    // process environment, which might belong to a production deployment.
    const values = parseEnvironment(fs.readFileSync(options.files[backend], 'utf8'));
    if (values.NYXLINK_LIVE_BACKEND && values.NYXLINK_LIVE_BACKEND !== backend) throw new TypeError('Live backend does not match the selected configuration file');
    configurations[backend] = { ...values, NYXLINK_LIVE_BACKEND: backend };
  }
  // Pure validation of all five scenarios happens before any child is started.
  for (const scenario of scenarios) validateConfiguration(configurations[scenario.backend], ['--armed', ...scenario.args]);
  if (!options.armed) return { mode: 'check', scenarios: scenarios.length, networkActionsPerformed: false, configurationValid: true };
  const before = revision(root);
  if (!before) throw new Error('Live suite requires a clean source checkout with a verified Git revision');
  const report = { timestamp: new Date().toISOString(), sourceRevision: before, passed: false, audioVerified: false, releaseApproved: false,
    scenarios: scenarios.map(({ backend, mode }) => ({ backend, mode, status: 'not-run' })) };
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('NYXLINK_')));
  for (let index = 0; index < scenarios.length; index++) {
    const scenario = scenarios[index];
    const result = execute(process.execPath, [path.join(__dirname, 'test-live-voice.cjs'), '--armed', ...scenario.args], {
      cwd: root, stdio: 'inherit', timeout: 600000,
      env: { ...inherited, ...configurations[scenario.backend] },
    });
    report.scenarios[index].status = result.status === 0 ? 'passed' : 'failed';
    if (result.status !== 0) break; // The failed harness owns teardown before a retry.
  }
  const after = revision(root);
  if (after !== before) report.sourceRevision = null;
  report.passed = Boolean(report.sourceRevision) && report.scenarios.every(scenario => scenario.status === 'passed');
  const target = path.join(root, '.runtime/live-suite', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.json');
  await (dependencies.saveReport ?? writePrivateReport)(target, report);
  return { ...report, report: target };
}

if (require.main === module) {
  if (process.argv.includes('--help')) console.log('node scripts/test-live-suite.cjs --nodelink-env <private-file> --lavalink-env <private-file> [--check | --armed]');
  else Promise.resolve().then(() => runSuite(parseArguments(process.argv.slice(2)))).then(result => {
    console.log(JSON.stringify(result));
    if (result.mode !== 'check' && !result.passed) process.exitCode = 1;
  }).catch(() => {
    // File/OS errors may include private paths or untrusted content.
    console.error('Live-suite preparation failed. Check both private configuration files, required fields and clean Git state. No credentials were printed.');
    process.exitCode = 1;
  });
}

module.exports = { parseEnvironment, parseArguments, runSuite, scenarios };
