const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { withBackendLab } = require('../tests/helpers/backend-lab.cjs');
const { sourceRevision, writePrivateReport, buildForLiveVoice } = require('./test-live-voice.cjs');
const {inspectSoak}=require('./check-endurance-evidence.cjs');
const root = path.resolve(__dirname, '..');

function parseArguments(args) {
  let hours = 24, armed = false;
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new TypeError('Duplicate soak option');
    seen.add(flag);
    if (flag === '--hours') {
      const value = args[++index];
      if (!value || !/^\d+$/.test(value)) throw new TypeError('Invalid soak duration');
      hours = Number(value);
    } else if (flag === '--armed') armed = true;
    else if (flag !== '--check') throw new TypeError('Unknown soak option');
  }
  if (!Number.isSafeInteger(hours) || hours < 24 || hours > 72 || seen.has('--armed') && seen.has('--check')) throw new TypeError('Soak requires 24..72 hours and one execution mode');
  return { hours, seconds: hours * 3600, armed };
}

function soakDirectory(base, runKey) {
  if (runKey === undefined) return base;
  if (typeof runKey !== 'string' || !/^ci-[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/.test(runKey)) throw new TypeError('Invalid soak run identity');
  return path.join(base, runKey);
}

async function run(options) {
  if (!options.armed) return { ...options, networkActionsPerformed: false, scope: 'configuration only; Linux and a container engine required for execution' };
  if (process.platform !== 'linux') throw new Error('Soak requires a Linux container host');
  const before = sourceRevision(root);
  if (!before) throw new Error('Soak requires a clean source checkout');
  // dist is deliberately excluded from the source cleanliness check; rebuild
  // it from the exact revision before creating any backend containers.
  if (buildForLiveVoice(root) !== before) throw new Error('Soak build revision changed');
  const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID();
  const baseDirectory = path.join(root, '.runtime/soak');
  const runKey = process.env.NYXLINK_SOAK_RUN_KEY;
  const directory = soakDirectory(baseDirectory, runKey);
  await fs.mkdir(baseDirectory, { recursive: true, mode: 0o700 });
  // An existing CI attempt directory cannot be reused or certified.
  if (runKey !== undefined) await fs.mkdir(directory, { mode: 0o700 });
  const original = path.join(directory, runId + '.worker.json');
  let interrupted = false, completed = false;
  try {
    await withBackendLab(async context => {
      const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('NYXLINK_')));
      const child = spawn(process.execPath, ['--expose-gc', '--max-old-space-size=512', 'scripts/endurance-worker.cjs', String(options.seconds)], {
        cwd: root, stdio: 'inherit', env: { ...inherited, NYXLINK_ENDURANCE_SOAK: '1', NYXLINK_ENDURANCE_REPORT: original, NYXLINK_BACKENDS_JSON: JSON.stringify(context) },
      });
      let force;
      const stop = () => { interrupted = true; child.kill('SIGTERM'); force ??= setTimeout(() => child.kill('SIGKILL'), 5000); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      const watchdog = setTimeout(stop, (options.seconds + 90) * 1000);
      try {
        const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
        completed = status === 0 && !interrupted;
      } finally {
        clearTimeout(watchdog); clearTimeout(force);
        process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      }
    });
  } catch { completed = false; }
  let measured = {};
  try { measured = JSON.parse(await fs.readFile(original, 'utf8')); } catch { /* Aborted runs may have no worker report. */ }
  const validation=inspectSoak(before,measured,options.hours);
  delete measured.error; // Never copy arbitrary backend error text into a summary.
  const after = sourceRevision(root);
  const report = { ...measured, timestamp: new Date().toISOString(), acceptanceScope: 'isolated backend protocol soak; no Discord voice or audible playback',
    requestedHours: options.hours, sourceRevision: before === after ? before : null, interrupted,
    validation:validation.checks,
    completed, passed: Boolean(completed && validation.soakEvidenceComplete && before === after), audioVerified: false, releaseApproved: false };
  const target = path.join(directory, runId + '.json');
  await writePrivateReport(target, report);
  await fs.rm(original, { force: true });
  return { report: target, passed: report.passed, sourceRevision: report.sourceRevision, interrupted, audioVerified: false, releaseApproved: false };
}

if (require.main === module) {
  if (process.argv.includes('--help')) console.log('node scripts/test-soak.cjs --hours <24..72> [--check | --armed]');
  else Promise.resolve().then(() => run(parseArguments(process.argv.slice(2)))).then(result => {
    console.log(JSON.stringify(result)); if (result.passed === false) process.exitCode = 1;
  }).catch(() => { console.error('Soak preparation failed; check duration, clean source and Linux container runtime.'); process.exitCode = 1; });
}
module.exports = { parseArguments, run, soakDirectory };
