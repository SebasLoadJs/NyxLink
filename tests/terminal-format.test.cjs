const test = require('node:test');
const assert = require('node:assert/strict');
const { formatStartupObservation, formatDashboardObservation, formatErrorDiagnostic } = require('../dist/src/logging/TerminalFormatter');
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

test('startup, dashboard and error panels color only the heading when explicitly enabled', () => {
  const contexts = [
    () => formatStartupObservation({ packageVersion: '5.3-dev', runtime: 'Node 22', readyNodes: 1, configuredNodes: 2 }, { width: 72 }, 'standard'),
    () => formatDashboardObservation({
      nodes: [], sources: [], audio: { players: 0, playing: 0, paused: 0, queuedTracks: 0 },
      runtime: { heapUsedBytes: 0, rssBytes: 0, uptimeSeconds: 0, eventLoopUtilization: 0 },
      truncatedNodes: 0,
    }, { width: 72 }),
    () => formatErrorDiagnostic({ diagnostic: { code: 'HTTP_429', message: 'rate limit', action: 'Try later' } }, { width: 72 }),
  ];
  const colored = [
    formatStartupObservation({ packageVersion: '5.3-dev', runtime: 'Node 22', readyNodes: 1, configuredNodes: 2 }, { color: true, width: 72 }, 'standard'),
    formatDashboardObservation({
      nodes: [], sources: [], audio: { players: 0, playing: 0, paused: 0, queuedTracks: 0 },
      runtime: { heapUsedBytes: 0, rssBytes: 0, uptimeSeconds: 0, eventLoopUtilization: 0 },
      truncatedNodes: 0,
    }, { color: true, width: 72 }),
    formatErrorDiagnostic({ diagnostic: { code: 'HTTP_429', message: 'rate limit', action: 'Try later' } }, { color: true, width: 72 }),
  ];
  const strip = text => text.replace(/\x1b\[[0-9;]*m/g, '');
  for (let index = 0; index < colored.length; index++) {
    assert.match(colored[index], /\x1b\[[0-9;]*m/, 'theme should color the visible heading');
    assert.equal(strip(colored[index]), contexts[index](), 'theme must not change data or visible panel geometry');
  }
  assert.doesNotMatch(contexts[0](), /\x1b\[/);
  assert.doesNotMatch(formatStartupObservation({ readyNodes: 0, configuredNodes: 0 }, { color: false }, 'compact'), /\x1b\[/);
});

test('compact dashboard uses observed counts without drawing a full panel', () => {
  const context = {
    nodes: [{ id: 'one', backend: 'lavalink', state: 'ready', players: 2 }],
    sources: [], audio: { players: 2, playing: 1, paused: 1, queuedTracks: 7 },
    runtime: { heapUsedBytes: 1234, rssBytes: 4000, uptimeSeconds: 10, eventLoopUtilization: 0.3 },
    truncatedNodes: 0,
  };
  const compact = formatDashboardObservation(context, { color: false }, 'compact');
  assert.equal(compact, 'NYXLINK / CLUSTER | 1 nodes shown | 1/2 playing | queue 7');
  assert.doesNotMatch(compact, /[┌└│]/);
  const colored = formatDashboardObservation(context, { color: true }, 'compact');
  assert.match(colored, /\x1b\[95mNYXLINK\x1b\[0m/);
  assert.equal(colored.replace(/\x1b\[[0-9;]*m/g, ''), compact);
});
