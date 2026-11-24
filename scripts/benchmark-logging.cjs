const fs = require('node:fs/promises');
const { performance } = require('node:perf_hooks');
const { Writable } = require('node:stream');
const { Logger, JsonLogTransport } = require('../dist');

async function measure(name, options, iterations = 5000) {
  let bytes = 0;
  const stream = new Writable({ write(chunk, _encoding, done) { bytes += chunk.length; done(); } });
  const sink = name === 'json' ? new JsonLogTransport(stream) : { write(record) { bytes += JSON.stringify(record).length; } };
  const logger = new Logger({ transports: [sink], maxQueue: 1024, ...options });
  const latencies = [];
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  const started = performance.now();
  for (let index = 0; index < iterations; index++) {
    const tick = performance.now();
    logger.event('debug', 'REST', 'request.completed', { index, nodeId: 'fixture', durationMs: 12, authorization: 'benchmark-canary' });
    latencies.push(performance.now() - tick);
    if ((index + 1) % 500 === 0) await logger.flush();
  }
  await logger.close();
  const elapsedMs = performance.now() - started;
  global.gc?.();
  latencies.sort((a, b) => a - b);
  return { name, iterations, elapsedMs, enqueueP50Ms: latencies[Math.floor(iterations * 0.5)], enqueueP95Ms: latencies[Math.floor(iterations * 0.95)],
    operationsPerSecond: iterations / elapsedMs * 1000, heapDeltaBytes: process.memoryUsage().heapUsed - before, bytes, stats: logger.getStats() };
}

(async () => {
  const results = [];
  for (const [name, options] of [['silent', { level: 'silent' }], ['structured', { level: 'debug' }], ['json', { level: 'debug' }]]) {
    results.push(await measure(name, options));
  }
  const report = { timestamp: new Date().toISOString(), node: process.version, platform: process.platform,
    scope: 'Local synthetic logging only; no terminal rendering, audio, servers or long-running leak certification.', results };
  await fs.mkdir('.runtime/benchmarks', { recursive: true });
  await fs.writeFile('.runtime/benchmarks/logging.json', JSON.stringify(report, null, 2) + '\n');
  for (const item of results) console.log(`${item.name}: ${Math.round(item.operationsPerSecond)} events/s; enqueue p95 ${item.enqueueP95Ms.toFixed(4)} ms; dropped ${item.stats.dropped}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
