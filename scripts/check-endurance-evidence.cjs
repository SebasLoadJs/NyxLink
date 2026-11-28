'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function sourceRevision(root = path.resolve(__dirname, '..')) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const revision = git(['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('Invalid source revision');
  if (git(['status', '--porcelain', '--untracked-files=normal', '--', '.', ':(exclude)dist'])) throw new Error('Evidence requires a clean checkout');
  return revision;
}

function inspectEndurance(revision, report) {
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new TypeError('Invalid expected revision');
  const checks = {
    exactRevision: report?.sourceRevision === revision,
    scope: report?.scope === 'local backend endurance; no Discord voice or audible playback',
    passed: report?.passed === true && !report?.error,
    duration: Number.isInteger(report?.durationSeconds) && report.durationSeconds >= 600 &&
      Number.isFinite(report.elapsedSeconds) && report.elapsedSeconds >= report.durationSeconds,
    backends: Array.isArray(report?.backends) && report.backends.length === 2 &&
      ['lavalink', 'nodelink'].every(kind => report.backends.some(b => b && b.backend === kind &&
        typeof b.version === 'string' && b.version.length > 0 &&
        typeof b.image === 'string' && b.image.length > 0 &&
        Number.isSafeInteger(b.cycles) && b.cycles >= Math.floor(report.durationSeconds / 2) &&
        Number.isSafeInteger(b.resumes) && b.resumes >= 1 &&
        Number.isSafeInteger(b.pings) && b.pings >= 1)),
    cleanup: report?.cleanup?.players === 0 && report?.cleanup?.nodes === 0 &&
      Array.isArray(report?.cleanup?.activeResources) && !report.cleanup.activeResources.includes('Timeout'),
    samples: Array.isArray(report?.samples) && report.samples.length >= 2 &&
      report.samples[0]?.elapsedSeconds <= 5 && report.samples.at(-1)?.elapsedSeconds >= report.durationSeconds &&
      report.samples.every((s,index) => s && Number.isFinite(s.elapsedSeconds) && s.elapsedSeconds >= 0 &&
        s.elapsedSeconds <= report.elapsedSeconds && (index===0 || s.elapsedSeconds >= report.samples[index-1]?.elapsedSeconds) &&
        Number.isFinite(s.heapUsedBytes) && s.heapUsedBytes >= 0 &&
        Number.isFinite(s.rssBytes) && s.rssBytes >= 0),
  };
  return { revision, checks, enduranceEvidenceComplete: Object.values(checks).every(Boolean),
    humanListeningRequired: true, releaseApproved: false };
}
function inspectSoak(revision,report,hours){
  if(!Number.isSafeInteger(hours)||hours<24||hours>72)throw new TypeError('Invalid soak duration');
  const base=inspectEndurance(revision,report);
  const checks={...base.checks,exactDuration:report?.durationSeconds===hours*3600,
    boundedSampling:Number.isSafeInteger(report?.samplingEverySeconds)&&report.samplingEverySeconds===60&&Array.isArray(report?.samples)&&report.samples.length<=Math.ceil(hours*3600/60)+2&&report.samples.every((s,i,a)=>i===0||s?.elapsedSeconds-a[i-1]?.elapsedSeconds<=180)};
  return {revision,checks,soakEvidenceComplete:Object.values(checks).every(Boolean),audioVerified:false,releaseApproved:false};
}
function inspectSoakReport(revision,report,hours){
  const base=inspectSoak(revision,report,hours);
  const checks={...base.checks,requestedHours:report?.requestedHours===hours,
    completed:report?.completed===true&&report?.interrupted===false,
    acceptanceScope:report?.acceptanceScope==='isolated backend protocol soak; no Discord voice or audible playback',
    scopeBoundaries:report?.audioVerified===false&&report?.releaseApproved===false};
  return {revision,checks,soakEvidenceComplete:Object.values(checks).every(Boolean),audioVerified:false,releaseApproved:false};
}
if (require.main === module) {
  try {
    const revision = sourceRevision();
    const args=process.argv.slice(2);
    if(args.length && (args.length!==3||args[0]!=='--soak'||!/^\d+$/.test(args[1]))) throw new Error('Usage: check-endurance-evidence.cjs [--soak HOURS REPORT]');
    const filename=args.length?args[2]:'.runtime/integration/endurance-report.json';
    const report = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
    const result = args.length?inspectSoakReport(revision,report,Number(args[1])):inspectEndurance(revision, report);
    console.log(JSON.stringify(result, null, 2));
    if (!(args.length?result.soakEvidenceComplete:result.enduranceEvidenceComplete)) process.exitCode = 1;
  } catch {
    console.error('Missing, invalid or unverifiable endurance evidence. Release approval not inferred.');
    process.exitCode = 1;
  }
}
module.exports = { sourceRevision, inspectEndurance, inspectSoak, inspectSoakReport };
