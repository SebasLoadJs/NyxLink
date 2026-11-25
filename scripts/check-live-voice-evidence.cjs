'use strict';

// Read-only release-evidence inventory. Never treats protocol observations as
// proof of audio heard by a human listener.
const fs = require('node:fs/promises');
const path = require('node:path');
const { sourceRevision } = require('./test-live-voice.cjs');

const REQUIRED = Object.freeze([
  ['nodelink', 'commands'],
  ['nodelink', 'reconnect'],
  ['nodelink', 'crossfade'],
  ['lavalink', 'commands'],
  ['lavalink', 'reconnect'],
]);
const COMMAND_CHECKS = [
  'playAcknowledged', 'firstTrackConfirmed', 'pauseConfirmed', 'resumeConfirmed',
  'volumeConfirmed', 'seekConfirmed', 'skipAcknowledged', 'secondTrackConfirmed', 'stopConfirmed',
];
const RECONNECT_CHECKS = [
  'initialTrackConfirmed', 'disconnectConfirmed', 'voiceReconnected',
  'restartAcknowledged', 'backendVoiceAndTrackConfirmed',
];

function inspectReports(revision, entries) {
  if (typeof revision !== 'string' || !/^[0-9a-f]{40}$/.test(revision)) {
    throw new TypeError('Release evidence must be checked against a clean Git commit SHA');
  }
  if (!Array.isArray(entries)) throw new TypeError('Evidence entries must be an array');
  const results = {};
  for (const [backend, mode] of REQUIRED) {
    const id = backend + ':' + mode;
    const matches = entries.filter(entry => {
      if (!entry || typeof entry.name !== 'string') return false;
      return new RegExp('^' + backend + '-' + mode + '-.+\\.json$').test(entry.name);
    }).sort((a, b) => a.name.localeCompare(b.name));
    const latest = matches.at(-1);
    if (!latest) {
      results[id] = 'missing';
      continue;
    }
    const report = latest.report;
    if (!report || typeof report !== 'object' || report.backend !== backend ||
        report.mode !== mode || report.sourceRevision !== revision) {
      results[id] = 'invalid-or-stale';
      continue;
    }
    const base = report.scope === 'opt-in real Discord gateway and voice integration' &&
      report.success === true && report.observed === true &&
      report.buildValidated === true &&
      report.audioMeasured === false && report.operatorListeningRequired === true &&
      !report.errorCode;
    const expected = mode === 'commands' ? COMMAND_CHECKS :
      mode === 'reconnect' ? RECONNECT_CHECKS : null;
    const actual = mode === 'commands' ? report.commandChecks :
      mode === 'reconnect' ? report.reconnectChecks : null;
    const protocol = expected ? JSON.stringify(actual) === JSON.stringify(expected) :
      report.remainingQueue === 0 && report.crossfadeEventObserved === true &&
      Array.isArray(report.transitionReasons) && report.transitionReasons.includes('crossfading') &&
      Array.isArray(report.events) &&
      JSON.stringify(report.events.filter(e => e?.type === 'trackStart').map(e => e.track)) ===
        JSON.stringify(['A', 'B']) &&
      report.events.some(e => e?.type === 'trackEnd' && e.track === 'A' && e.reason === 'crossfading');
    results[id] = base && protocol ? 'protocol-pass' : 'failed';
  }
  const protocolEvidenceComplete = Object.values(results).every(status => status === 'protocol-pass');
  return {
    revision,
    modes: results,
    protocolEvidenceComplete,
    humanListeningRequired: true,
    // This tool deliberately cannot approve a release; independent human
    // listening and licensing/publication gates remain outside its scope.
    releaseApproved: false,
  };
}

async function inspectDirectory(revision, folder = path.resolve('.runtime/live-voice')) {
  const names = await fs.readdir(folder).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const entries = [];
  for (const name of names.filter(name => /^(?:nodelink|lavalink)-(?:commands|reconnect|crossfade)-.+\.json$/.test(name))) {
    let report;
    try { report = JSON.parse(await fs.readFile(path.join(folder, name), 'utf8')); }
    catch { report = null; }
    entries.push({ name, report });
  }
  return inspectReports(revision, entries);
}

if (require.main === module) {
  const revision = sourceRevision();
  if (!revision) {
    console.error('Release voice evidence requires a clean Git checkout; no release approval inferred.');
    process.exitCode = 1;
  } else {
    void inspectDirectory(revision).then(summary => {
      console.log(JSON.stringify(summary, null, 2));
      if (!summary.protocolEvidenceComplete) process.exitCode = 1;
    }).catch(() => {
      console.error('Could not inspect local private voice reports. No report content was printed.');
      process.exitCode = 1;
    });
  }
}

module.exports = { inspectReports, inspectDirectory, REQUIRED };
