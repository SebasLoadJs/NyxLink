const test = require('node:test');
const assert = require('node:assert/strict');
const { Logger, PinoLogTransport, OpenTelemetryLogTransport } = require('../dist');

test('Pino receives one redacted structured event at its mapped level and flushes without ownership', async () => {
  const calls = []; let flushed = 0;
  const pino = Object.fromEntries(['trace','debug','info','warn','error'].map(level => [level, (fields, message) => calls.push({ level, fields, message })]));
  pino.flush = cb => { flushed++; cb(); };
  const logger = new Logger({ level: 'trace', transports: [new PinoLogTransport(pino)] });
  logger.event('warn', 'Node', 'request.failed', { token: 'PRIVATE_CANARY', sessionId: 'PRIVATE_SESSION', url: 'https://user:PRIVATE_PASSWORD@example.invalid' });
  await logger.flush();
  assert.equal(calls.length, 1); assert.equal(calls[0].level, 'warn');
  assert.equal(calls[0].fields.nyxlink.context.token, '[REDACTED]');
  assert.doesNotMatch(JSON.stringify(calls), /PRIVATE_/);
  await logger.close(); assert.ok(flushed > 0);
});

test('Pino flush failure is isolated by the pipeline and does not prevent other destinations', async () => {
  const pino = Object.fromEntries(['trace','debug','info','warn','error'].map(level => [level, () => {}]));
  pino.flush = cb => cb(new Error('flush rejected'));
  const seen = [];
  const logger = new Logger({ level: 'info', transports: [new PinoLogTransport(pino), { write: record => seen.push(record) }] });
  logger.info('Core', 'test'); await logger.close();
  assert.equal(seen.length, 1); assert.ok(logger.getStats().transportErrors > 0);
});

test('OTel exports only completed observed durations with fixed metric labels and redacted correlation', async () => {
  const spans = [], counts = [];
  const tracer = { startSpan(name, options) {
    const entry = { name, options }; spans.push(entry);
    return { setStatus(status) { entry.status = status; }, end(time) { entry.end = time; } };
  } };
  const logger = new Logger({ level: 'trace', transports: [new OpenTelemetryLogTransport(tracer, { add: (value, attributes) => counts.push({ value, attributes }) })] });
  await logger.traceOperation('search', async () => 42, { guildId: '123456789012345678', token: 'PRIVATE_CANARY', traceId: 'trace-1' });
  const original = new Error('PRIVATE_CANARY');
  await assert.rejects(logger.traceOperation('fail', async () => { throw original; }), error => error === original);
  logger.info('Node', 'ordinary event'); await logger.close();
  assert.equal(spans.length, 2); assert.deepEqual(spans.map(s => s.status.code), [1, 2]);
  for (const span of spans) {
    assert.ok(span.options.startTime <= span.end);
    assert.ok(span.options.attributes['nyxlink.duration_ms'] >= 0);
    assert.ok(!('parent' in span.options));
  }
  assert.ok(counts.length > spans.length);
  assert.ok(counts.every(c => Object.keys(c.attributes).join() === 'nyxlink.level'));
  assert.doesNotMatch(JSON.stringify(spans), /PRIVATE_|123456789012345678/);
});

test('OTel always ends its span when status export throws', () => {
  let ended = 0;
  const transport = new OpenTelemetryLogTransport({ startSpan: () => ({ setStatus() { throw new Error('export failure'); }, end() { ended++; } }) });
  assert.throws(() => transport.write({ timestamp: new Date().toISOString(), event: 'operation.completed', level: 'debug', context: { durationMs: 2 } }), /export failure/);
  assert.equal(ended, 1);
});
