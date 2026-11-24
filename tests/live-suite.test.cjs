const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseEnvironment, parseArguments, runSuite } = require('../scripts/test-live-suite.cjs');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxlink-live-suite-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const fields = { NYXLINK_DISCORD_BOT_TOKEN: 'PRIVATE_TEST_TOKEN', NYXLINK_DISCORD_GUILD_ID: '123456789012345678',
    NYXLINK_DISCORD_VOICE_CHANNEL_ID: '223456789012345678', NYXLINK_NODE_HOST: '127.0.0.1', NYXLINK_NODE_PORT: '2333',
    NYXLINK_NODE_PASSWORD: 'PRIVATE_TEST_PASSWORD', NYXLINK_LIVE_TRACK_A: 'https://example.test/a.wav', NYXLINK_LIVE_TRACK_B: 'https://example.test/b.wav' };
  const files = {};
  for (const backend of ['nodelink', 'lavalink']) {
    files[backend] = path.join(directory, backend + '.env');
    await fs.writeFile(files[backend], Object.entries(fields).map(([key, value]) => key + '=' + value).join('\n'), { mode: 0o600 });
  }
  return { files, fields };
}

test('environment parsing is literal and rejects startup injection, unknown or duplicate fields', () => {
  const value = parseEnvironment('# comment\nNYXLINK_NODE_PASSWORD="a=b#c$(never-run)"\n');
  assert.equal(value.NYXLINK_NODE_PASSWORD, 'a=b#c$(never-run)');
  for (const input of ['NODE_OPTIONS=--require=evil', 'NYXLINK_UNKNOWN=secret', 'NYXLINK_NODE_PASSWORD=a\nNYXLINK_NODE_PASSWORD=b', 'NYXLINK_NODE_PASSWORD="unfinished', 'NYXLINK_NODE_PASSWORD=\0']) assert.throws(() => parseEnvironment(input), TypeError);
});

test('runner defaults to local validation and cannot accidentally arm from partial arguments', () => {
  const options = parseArguments(['--nodelink-env', 'private-a', '--lavalink-env', 'private-b']);
  assert.equal(options.armed, false);
  for (const args of [[], ['--armed'], ['--nodelink-env', '--armed'], ['--unknown'], ['--armed', '--check', '--nodelink-env', 'a', '--lavalink-env', 'b']]) assert.throws(() => parseArguments(args), TypeError);
});

test('check mode validates all scenarios without starting a process, network or report', async t => {
  const { files } = await fixture(t);
  const result = await runSuite({ files, armed: false }, { execute() { throw new Error('network must remain disabled'); }, saveReport() { throw new Error('no report'); } });
  assert.deepEqual(result, { mode: 'check', scenarios: 5, networkActionsPerformed: false, configurationValid: true });
  assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
});

test('armed runner uses child environment only, executes five modes and preserves private SHA evidence', async t => {
  const { files } = await fixture(t); const calls = [], reports = [];
  const previous = process.env.NYXLINK_NODE_SECURE;
  process.env.NYXLINK_NODE_SECURE = 'production-setting';
  t.after(() => { if (previous === undefined) delete process.env.NYXLINK_NODE_SECURE; else process.env.NYXLINK_NODE_SECURE = previous; });
  const result = await runSuite({ files, armed: true }, { revision: () => 'a'.repeat(40),
    execute(command, args, options) { calls.push({ command, args, options }); return { status: 0 }; }, async saveReport(_target, report) { reports.push(report); } });
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map(call => call.options.env.NYXLINK_LIVE_BACKEND), ['nodelink', 'nodelink', 'nodelink', 'lavalink', 'lavalink']);
  assert.deepEqual(calls.map(call => call.args.slice(2)), [['--commands'], ['--reconnect'], [], ['--commands'], ['--reconnect']]);
  assert.ok(calls.every(call => call.args.includes('--armed')));
  assert.ok(calls.every(call => call.options.env.NYXLINK_NODE_SECURE === undefined));
  assert.ok(calls.every(call => !JSON.stringify(call.args).includes('PRIVATE_')));
  assert.equal(result.passed, true); assert.equal(result.audioVerified, false); assert.equal(result.releaseApproved, false);
  assert.equal(reports.length, 1); assert.ok(!JSON.stringify(reports).includes('PRIVATE_'));
});

test('runner refuses dirty source before login and stops after the first failed scenario', async t => {
  const { files } = await fixture(t); let calls = 0;
  await assert.rejects(runSuite({ files, armed: true }, { revision: () => null, execute() { calls++; } }), /clean source/);
  assert.equal(calls, 0);
  const result = await runSuite({ files, armed: true }, { revision: () => 'b'.repeat(40), execute() { calls++; return { status: 1 }; }, async saveReport() {} });
  assert.equal(calls, 1); assert.equal(result.passed, false);
  assert.deepEqual(result.scenarios.map(s => s.status), ['failed', 'not-run', 'not-run', 'not-run', 'not-run']);
});

test('CLI preparation errors never print credential values or environment-file content', async t => {
  const { files } = await fixture(t);
  await fs.appendFile(files.lavalink, '\nNYXLINK_NODE_PORT=PRIVATE_INVALID_VALUE');
  const result = spawnSync(process.execPath, ['scripts/test-live-suite.cjs', '--nodelink-env', files.nodelink, '--lavalink-env', files.lavalink, '--check'], { encoding: 'utf8', timeout: 5000 });
  assert.notEqual(result.status, 0); assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_/); assert.match(result.stderr, /preparation failed/);
});

test('generated controlled fixtures have different tones and valid 15-second PCM/WAV framing', () => {
  const { wav } = require('../scripts/create-live-fixtures.cjs');
  const a = wav(440, 15), b = wav(660, 15);
  assert.equal(a.toString('ascii', 0, 4), 'RIFF'); assert.equal(a.toString('ascii', 8, 12), 'WAVE');
  assert.equal(a.readUInt32LE(24), 48000); assert.equal(a.readUInt32LE(40), 48000 * 15 * 2);
  assert.notDeepEqual(a.subarray(44, 1000), b.subarray(44, 1000)); assert.throws(() => wav(440, 1), TypeError);
});

test('a changed checkout invalidates suite evidence even when all child modes exit successfully', async t => {
  const { files } = await fixture(t); let reads = 0;
  const result = await runSuite({ files, armed: true }, { revision: () => (++reads === 1 ? 'a' : 'b').repeat(40), execute: () => ({ status: 0 }), async saveReport() {} });
  assert.equal(result.passed, false); assert.equal(result.sourceRevision, null);
});

test('missing private-file credentials are never filled from a production process environment', async t => {
  const { files, fields } = await fixture(t);
  const previous = process.env.NYXLINK_DISCORD_BOT_TOKEN;
  process.env.NYXLINK_DISCORD_BOT_TOKEN = 'PRIVATE_PRODUCTION_TOKEN';
  t.after(() => { if (previous === undefined) delete process.env.NYXLINK_DISCORD_BOT_TOKEN; else process.env.NYXLINK_DISCORD_BOT_TOKEN = previous; });
  await fs.writeFile(files.lavalink, Object.entries(fields).filter(([key]) => key !== 'NYXLINK_DISCORD_BOT_TOKEN').map(([key, value]) => key + '=' + value).join('\n'));
  let calls = 0;
  await assert.rejects(runSuite({ files, armed: true }, { execute() { calls++; } }), /Missing environment variables/);
  assert.equal(calls, 0);
});
