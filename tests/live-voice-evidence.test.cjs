const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { inspectReports, inspectDirectory } = require('../scripts/check-live-voice-evidence.cjs');

const revision = 'b'.repeat(40);
const commandChecks = ['playAcknowledged', 'firstTrackConfirmed', 'pauseConfirmed',
  'resumeConfirmed', 'volumeConfirmed', 'seekConfirmed', 'skipAcknowledged', 'secondTrackConfirmed', 'stopConfirmed'];
const reconnectChecks = ['initialTrackConfirmed', 'disconnectConfirmed', 'voiceReconnected',
  'restartAcknowledged', 'backendVoiceAndTrackConfirmed'];
function make(backend, mode, suffix = '2026-11-23T20-00-00.000Z') {
  return {
    name: `${backend}-${mode}-${suffix}-00000000-0000-4000-8000-000000000000.json`,
    report: {
      scope: 'opt-in real Discord gateway and voice integration',
      backend, mode, sourceRevision: revision, success: true, observed: true,
      buildValidated: true, audioMeasured: false, operatorListeningRequired: true,
      commandChecks: mode === 'commands' ? commandChecks : undefined,
      reconnectChecks: mode === 'reconnect' ? reconnectChecks : undefined,
      remainingQueue: mode === 'crossfade' ? 0 : undefined,
      crossfadeEventObserved: mode === 'crossfade',
      transitionReasons: mode === 'crossfade' ? ['crossfading'] : undefined,
      events: mode === 'crossfade' ? [{ type: 'trackStart', track: 'A' },
        { type: 'trackEnd', track: 'A', reason: 'crossfading' },
        { type: 'trackStart', track: 'B' }] : [],
    },
  };
}
const all = () => [
  make('nodelink', 'commands'), make('nodelink', 'reconnect'),
  make('nodelink', 'crossfade'), make('lavalink', 'commands'),
  make('lavalink', 'reconnect'),
];

test('missing voice reports cannot complete protocol acceptance', () => {
  const result = inspectReports(revision, []);
  assert.equal(result.protocolEvidenceComplete, false);
  assert.equal(result.modes['nodelink:crossfade'], 'missing');
  assert.equal(result.humanListeningRequired, true);
  assert.equal(result.releaseApproved, false);
});

test('five valid mode reports only complete protocol evidence, never audible approval', () => {
  const result = inspectReports(revision, all());
  assert.equal(result.protocolEvidenceComplete, true);
  assert.ok(Object.values(result.modes).every(value => value === 'protocol-pass'));
  assert.equal(result.humanListeningRequired, true);
  assert.equal(result.releaseApproved, false);
});

test('a newer failed voice report cannot be hidden by an earlier successful report', () => {
  const entries = all();
  const newer = make('nodelink', 'commands', '2026-11-23T21-00-00.000Z');
  newer.report.success = false;
  entries.push(newer);
  const result = inspectReports(revision, entries);
  assert.equal(result.modes['nodelink:commands'], 'failed');
  assert.equal(result.protocolEvidenceComplete, false);
});

test('stale revisions and incomplete command checks cannot pass voice evidence', () => {
  const stale = all();
  stale[0].report.sourceRevision = 'a'.repeat(40);
  assert.equal(inspectReports(revision, stale).modes['nodelink:commands'], 'invalid-or-stale');
  const incomplete = all();
  incomplete[1].report.reconnectChecks = reconnectChecks.slice(0, 4);
  assert.equal(inspectReports(revision, incomplete).modes['nodelink:reconnect'], 'failed');
  assert.throws(() => inspectReports(null, []), TypeError);
});

test('private evidence directory inspection tolerates absent and corrupt files', async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxlink-evidence-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  assert.equal((await inspectDirectory(revision, folder)).protocolEvidenceComplete, false);
  const fixture = all();
  await Promise.all(fixture.map(entry => fs.writeFile(path.join(folder, entry.name), JSON.stringify(entry.report))));
  assert.equal((await inspectDirectory(revision, folder)).protocolEvidenceComplete, true);
  await fs.writeFile(path.join(folder, fixture[0].name), '{corrupt');
  assert.equal((await inspectDirectory(revision, folder)).modes['nodelink:commands'], 'invalid-or-stale');
});

test('two track starts without a crossfading transition event do not pass crossfade evidence', () => {
  const entries = all();
  entries[2].report.crossfadeEventObserved = false;
  entries[2].report.transitionReasons = ['finished'];
  const summary = inspectReports(revision, entries);
  assert.equal(summary.modes['nodelink:crossfade'], 'failed');
  assert.equal(summary.protocolEvidenceComplete, false);
  assert.equal(summary.releaseApproved, false);
});

test('a crossfading event for track B cannot certify the handoff of track A', () => {
  const entries = all();
  entries[2].report.events[1].track = 'B';
  const summary = inspectReports(revision, entries);
  assert.equal(summary.modes['nodelink:crossfade'], 'failed');
  assert.equal(summary.protocolEvidenceComplete, false);
});

test('out-of-order or duplicate track starts invalidate crossfade evidence', () => {
  const reversed = all();
  reversed[2].report.events = [
    { type: 'trackStart', track: 'B' },
    { type: 'trackEnd', track: 'A', reason: 'crossfading' },
    { type: 'trackStart', track: 'A' },
  ];
  assert.equal(inspectReports(revision, reversed).modes['nodelink:crossfade'], 'failed');
  const duplicate = all();
  duplicate[2].report.events.push({ type: 'trackStart', track: 'B' });
  assert.equal(inspectReports(revision, duplicate).modes['nodelink:crossfade'], 'failed');
});

test('a report without a verified fresh build cannot certify voice protocols', () => {
  const entries = all();
  delete entries[0].report.buildValidated;
  assert.equal(inspectReports(revision, entries).modes['nodelink:commands'], 'failed');
  assert.equal(inspectReports(revision, entries).protocolEvidenceComplete, false);
});

 test('command reports without confirmed stop cannot certify acceptance', () => {
  const entries = all();
  entries[0].report.commandChecks = commandChecks.slice(0, -1);
  const summary = inspectReports(revision, entries);
  assert.equal(summary.modes['nodelink:commands'], 'failed');
  assert.equal(summary.protocolEvidenceComplete, false);
});
