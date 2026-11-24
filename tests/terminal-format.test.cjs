const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDashboardObservation, formatErrorDiagnostic } = require('../dist/src/logging/TerminalFormatter');
const { formatBox, formatSystemStatus } = require('../dist/src/logging/LogFormatter');

test('cluster panel leaves unknown telemetry empty and shows real runtime fields', () => {
  const panel = formatDashboardObservation({ nodes: [{ id: 'observed', backend: 'lavalink', state: 'ready', players: 2 }], sources: [],
    audio: { players: 2, playing: 1, paused: 1, queuedTracks: 3 }, runtime: { heapUsedBytes: 1234, rssBytes: 5000, uptimeSeconds: 1, eventLoopUtilization: 0.25 }, truncatedNodes: 0 }, { width: 60 });
  assert.match(panel, /OBSERVED CLUSTER/);
  assert.match(panel, /observed \/ lavalink \/ ready \/ --/);
  assert.match(panel, /heap 1234 B/);
  assert.match(panel, /No current source-health observations/);
  assert.doesNotMatch(panel, /HEALTHY|RECOVERED/);
});

test('truncated or malformed dashboard observations use the log-message fallback', () => {
  assert.equal(formatDashboardObservation({ truncated: true }, {}), undefined);
  assert.equal(formatErrorDiagnostic({ diagnostic: 'untrusted' }, {}), undefined);
});

test('diagnostic panels show actual code, cause and grounded advice', () => {
  const panel = formatErrorDiagnostic({ traceId: 'trace-1', diagnostic: { code: 'HTTP_429', message: 'rate limited', action: 'Respect retry delay.' } }, {});
  assert.match(panel, /HTTP_429/); assert.match(panel, /rate limited/); assert.match(panel, /Respect retry delay/); assert.match(panel, /trace-1/);
});

test('panels respect narrow widths and non-finite widths cannot crash formatting', () => {
  for (const panel of [formatBox('A long title for a narrow terminal', { values: 'x'.repeat(100) }, 20), formatSystemStatus([], { width: 20 })]) {
    assert.ok(panel.split('\n').every(line => [...line].length <= 20));
  }
  assert.doesNotThrow(() => formatBox('safe', {}, Infinity));
  assert.doesNotThrow(() => formatSystemStatus([], { width: NaN }));
});
