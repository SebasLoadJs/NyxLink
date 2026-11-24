const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { spawnSync } = require('node:child_process');
const { Logger, JsonLogTransport, diagnoseError, HttpError, FeatureUnavailableError } = require('../dist');
const { safeLogValue } = require('../dist/src/logging/StructuredLog');

function capture(options = {}) {
  const records = [];
  const logger = new Logger({ level: 'trace', transports: [{ write: record => { records.push(record); } }], ...options });
  return { logger, records };
}

test('silent logging does not inspect or serialize untrusted context', async () => {
  let inspected = 0;
  const context = new Proxy({}, { ownKeys() { inspected++; throw new Error('must remain lazy'); } });
  const { logger, records } = capture({ level: 'silent' });
  logger.event('error', 'Node', 'hidden', context);
  await logger.close();
  assert.equal(inspected, 0);
  assert.deepEqual(records, []);
});

test('every transport receives detached immutable redacted records with ordered sequences', async () => {
  const { logger, records } = capture({ context: { application: 'example' } });
  const context = { nested: { password: 'PRIVATE_PASS', session_id: 'PRIVATE_SESSION', botToken: 'PRIVATE_BOT', voiceToken: 'PRIVATE_VOICE', privateKey: 'PRIVATE_KEY', visible: 3n }, userData: { value: 'PRIVATE_USER' } };
  context.self = context;
  logger.child({ guildId: '123456789012345678', traceId: 'trace-a' }).event('info', 'REST', 'request.done', context, 'https://user:PRIVATE_URL@example.org session_id=PRIVATE_INLINE');
  context.nested.visible = 9n;
  logger.info('Node', 'connected');
  await logger.flush();
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(r => r.sequence), [1, 2]);
  const text = JSON.stringify(records);
  for (const secret of ['PRIVATE_PASS', 'PRIVATE_SESSION', 'PRIVATE_BOT', 'PRIVATE_VOICE', 'PRIVATE_KEY', 'PRIVATE_USER', 'PRIVATE_URL', 'PRIVATE_INLINE']) assert.ok(!text.includes(secret), secret);
  assert.equal(records[0].context.nested.visible, '3');
  assert.equal(records[0].context.guildId, '123456789012345678');
  assert.equal(records[0].context.application, 'example');
  assert.equal(records[0].context.self, '[Circular]');
  assert.equal(Object.isFrozen(records[0].context.nested), true);
  await logger.close();
});

test('serialization never executes getters, custom inspect hooks or toJSON', () => {
  let calls = 0;
  const input = { visible: 'safe', get token() { calls++; throw new Error('getter'); }, get other() { calls++; return 'hidden'; },
    toJSON() { calls++; throw new Error('toJSON'); }, [Symbol.for('nodejs.util.inspect.custom')]() { calls++; throw new Error('inspect'); } };
  const result = safeLogValue(input);
  assert.equal(calls, 0);
  assert.equal(result.token, '[REDACTED]');
  assert.equal(result.other, '[Accessor]');
  assert.equal(result.visible, 'safe');
  assert.doesNotThrow(() => JSON.stringify(safeLogValue(new Proxy({}, { ownKeys() { throw new Error('proxy'); } }))));
});

test('huge strings, cyclic error causes and contexts have bounded output', async () => {
  const { logger, records } = capture();
  const error = new Error('password=PRIVATE_ERROR');
  error.cause = error;
  logger.event('error', 'x'.repeat(100000), 'failure', { error, many: Array(1000).fill('z'.repeat(10000)) }, 'y'.repeat(100000));
  await logger.close();
  assert.equal(records.length, 1);
  assert.ok(JSON.stringify(records[0]).length < 18000);
  assert.ok(!JSON.stringify(records).includes('PRIVATE_ERROR'));
});

test('bounded queue prioritizes warnings and exposes discarded records', async () => {
  let release;
  const records = [];
  const blocked = new Promise(resolve => { release = resolve; });
  const logger = new Logger({ level: 'trace', maxQueue: 2, transports: [{ async write(record) { records.push(record); if (records.length === 1) await blocked; } }] });
  logger.info('Node', 'first');
  await new Promise(resolve => setImmediate(resolve));
  logger.debug('Node', 'low-a'); logger.debug('Node', 'low-b'); logger.debug('Node', 'dropped-low');
  logger.error('Node', 'important');
  assert.equal(logger.getStats().queued, 2);
  assert.equal(logger.getStats().dropped, 2);
  release();
  await logger.close();
  assert.ok(records.some(r => r.message === 'important'));
  assert.ok(!records.some(r => r.message === 'dropped-low'));
  assert.equal(logger.getStats().droppedCritical, 0);
});

test('critical saturation is counted and timeline retention is explicitly bounded', async () => {
  const { logger } = capture({ maxQueue: 1, timelineLimit: 2 });
  logger.error('Node', 'first'); logger.error('Node', 'second'); logger.error('Node', 'third');
  assert.equal(logger.getStats().droppedCritical, 2);
  assert.deepEqual(logger.timeline().map(r => r.message), ['second', 'third']);
  await logger.close();
  assert.deepEqual(logger.timeline(), []);
});

test('timeline filters child correlation and does not retain anything by default', async () => {
  const { logger } = capture({ timelineLimit: 4 });
  logger.child({ traceId: 'one', guildId: 'guild-a' }).info('Search', 'start');
  logger.child({ traceId: 'two', guildId: 'guild-b' }).info('Search', 'other');
  assert.equal(logger.timeline({ traceId: 'one' }).length, 1);
  assert.equal(logger.timeline({ guildId: 'guild-b', limit: 1 })[0].message, 'other');
  assert.deepEqual(logger.timeline({ limit: 0 }), []);
  const normal = capture(); normal.logger.info('Node', 'not retained');
  assert.deepEqual(normal.logger.timeline(), []);
  await Promise.all([logger.close(), normal.logger.close()]);
});

test('a rejecting or hanging transport cannot break healthy sinks or block close indefinitely', async () => {
  const records = [], failures = [];
  let hangingCalls = 0, rejectedCalls = 0;
  const logger = new Logger({ level: 'info', transportTimeoutMs: 15, transports: [
    { write() { hangingCalls++; return new Promise(() => {}); } },
    { write() { rejectedCalls++; return Promise.reject(new Error('password=PRIVATE_SINK')); } },
    { write(record) { records.push(record); } },
  ], onTransportError(error) { failures.push(error.message); throw new Error('observer'); } });
  logger.info('Node', 'first'); logger.info('Node', 'second');
  await logger.close();
  assert.equal(records.length, 2);
  assert.equal(hangingCalls, 1);
  assert.equal(rejectedCalls, 1);
  assert.equal(logger.getStats().transportErrors, 2);
  assert.ok(failures.every(value => !value.includes('PRIVATE_SINK')));
});

test('flush and close preserve transport ordering and close each destination once', async () => {
  const calls = [];
  const sink = { write(record) { calls.push(record.message); }, flush() { calls.push('flush'); }, close() { calls.push('close'); } };
  const logger = new Logger({ level: 'info', transports: [sink, sink] });
  const child = logger.child({});
  logger.info('Node', 'first'); child.info('Node', 'second');
  await Promise.all([logger.close(), logger.close()]);
  child.info('Node', 'after parent close');
  assert.deepEqual(calls, ['first', 'second', 'flush', 'close']);
});

test('closing a child leaves the parent destination available', async () => {
  const { logger, records } = capture();
  const child = logger.child({ traceId: 'child' });
  await child.close();
  child.info('Node', 'hidden'); logger.info('Node', 'parent');
  await logger.close();
  assert.deepEqual(records.map(r => r.message), ['parent']);
});

test('traceOperation preserves return values and original failures with one correlation ID', async () => {
  const { logger, records } = capture({ timelineLimit: 10 });
  assert.equal(await logger.traceOperation('lookup', async log => { log.info('Search', 'query'); return 7; }), 7);
  const original = new Error('token=PRIVATE_FAILURE');
  await assert.rejects(logger.traceOperation('broken', async () => { throw original; }), error => error === original);
  await logger.close();
  const success = records.filter(r => r.context.operation === 'lookup');
  assert.equal(success.length, 3);
  assert.equal(new Set(success.map(r => r.context.traceId)).size, 1);
  assert.ok(records.some(r => r.event === 'operation.failed' && r.context.durationMs >= 0));
  assert.ok(!JSON.stringify(records).includes('PRIVATE_FAILURE'));
});

test('JSON stream transport respects asynchronous writes and emits valid JSON without decoration', async () => {
  const chunks = [];
  const stream = new Writable({ highWaterMark: 1, write(chunk, _encoding, callback) { chunks.push(chunk.toString()); setImmediate(callback); } });
  const logger = new Logger({ profile: 'diagnostic', mode: 'json', color: true, transports: [new JsonLogTransport(stream)] });
  logger.banner(); logger.systemStatus([]); logger.box('Node', 'password=PRIVATE_BOX', { token: 'PRIVATE_FIELD' });
  logger.failover({ source: 'a', target: 'b', status: 'failed', reason: 'password=PRIVATE_REASON' });
  await logger.close();
  assert.equal(chunks.length, 4);
  for (const chunk of chunks) { assert.doesNotThrow(() => JSON.parse(chunk)); assert.doesNotMatch(chunk, /\x1b|┌|PRIVATE_/); }
  assert.equal(stream.listenerCount('error'), 0);
  assert.equal(stream.destroyed, false, 'caller owns the stream');
});

test('JSON stream errors are isolated and their temporary listener is released', async () => {
  const stream = new Writable({ write(_chunk, _encoding, callback) { callback(new Error('token=PRIVATE_STREAM')); } });
  const { logger, records } = capture({ transports: [new JsonLogTransport(stream), { write(record) { records.push(record); } }] });
  logger.info('Node', 'first');
  await logger.close();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(logger.getStats().transportErrors, 1);
  assert.equal(records.length, 1);
  assert.equal(stream.listenerCount('error'), 0);
});

test('NO_COLOR and ASCII configuration work even when color was explicitly requested', () => {
  const output = spawnSync(process.execPath, ['-e', `const {Logger}=require('./dist');const log=new Logger({level:'info',color:true,unicode:false,timestamps:false});log.info('Node','ready');log.banner();log.systemStatus([]);log.close();`],
    { encoding: 'utf8', timeout: 5000, env: { ...process.env, NO_COLOR: '' } });
  assert.equal(output.status, 0, output.stderr);
  assert.doesNotMatch(output.stdout, /\x1b\[|[┌│┐─█]/);
  assert.match(output.stdout, /NYXLINK \/ AUDIO CLIENT/);
});

test('diagnostics use known typed errors and do not invent an unknown root cause', () => {
  const unavailable = diagnoseError(new FeatureUnavailableError('mix:add', 'lavalink'));
  assert.equal(unavailable.code, 'FEATURE_UNAVAILABLE');
  assert.match(unavailable.action, /capability/);
  assert.match(diagnoseError(new HttpError(429)).action, /retry delay/);
  assert.match(diagnoseError(new HttpError(403)).action, /credentials/);
  assert.equal(diagnoseError(new Error('unclassified')).code, 'UNKNOWN_ERROR');
  assert.match(diagnoseError(new Error('unclassified')).action, /not been classified/);
});

test('configuration and log level mutations reject invalid bounds', () => {
  for (const options of [{ level: 'invalid' }, { level: 'toString' }, { profile: '__proto__' }, { profile: 'invalid' }, { mode: 'xml' }, { layout: 'invalid' }, { maxQueue: 0 }, { timelineLimit: Infinity }, { width: NaN }, { transportTimeoutMs: 0 }, { sampleRate: NaN }, { deduplicateMs: Infinity }]) {
    assert.throws(() => new Logger(options), TypeError);
  }
  const { logger } = capture();
  assert.throws(() => logger.setLevel('invalid'), TypeError);
  assert.throws(() => logger.timeline({ limit: -1 }), TypeError);
});

test('sampling never suppresses warning/error records and counts skipped debug messages', async () => {
  const { logger, records } = capture({ sampleRate: 0 });
  logger.debug('Node', 'sampled'); logger.trace('Node', 'sampled too');
  logger.info('Node', 'info'); logger.warn('Node', 'warning'); logger.error('Node', 'error');
  await logger.close();
  assert.deepEqual(records.map(r => r.message), ['info', 'warning', 'error']);
  assert.equal(logger.getStats().sampled, 2);
});

test('deduplication produces counted summaries without grouping warnings or errors', async () => {
  const { logger, records } = capture({ deduplicateMs: 1000 });
  logger.event('info', 'Node', 'repeat', { count: 'untrusted' });
  logger.event('info', 'Node', 'repeat', { count: 'untrusted' });
  logger.event('info', 'Node', 'repeat', { count: 'untrusted' });
  logger.error('Node', 'critical'); logger.error('Node', 'critical');
  await logger.close();
  assert.equal(records.filter(r => r.event === 'repeat').length, 1);
  assert.equal(records.filter(r => r.level === 'error').length, 2);
  assert.equal(records.find(r => r.event === 'log.repeated').context.count, 2);
  assert.equal(logger.getStats().suppressed, 2);
  assert.deepEqual(records.map(r => r.sequence), [1, 2, 3, 4]);
});

test('expired repetition summaries preserve output sequence order', async () => {
  const { logger, records } = capture({ deduplicateMs: 5 });
  logger.info('Node', 'repeat'); logger.info('Node', 'repeat');
  await new Promise(resolve => setTimeout(resolve, 15));
  logger.info('Node', 'repeat');
  await logger.close();
  assert.deepEqual(records.map(r => r.event), ['info', 'log.repeated', 'info']);
  assert.deepEqual(records.map(r => r.sequence), [1, 2, 3]);
});

test('async correlation follows root log calls and remains isolated between overlapping operations', async () => {
  const { logger, records } = capture();
  await Promise.all(['left', 'right'].map(traceId => logger.traceOperation('parallel', async () => {
    await new Promise(resolve => setImmediate(resolve));
    logger.info('Player', traceId);
    await logger.traceOperation('nested', async () => { logger.debug('REST', traceId); });
  }, { traceId })));
  logger.info('Node', 'outside');
  await logger.close();
  for (const traceId of ['left', 'right']) {
    const recordsForTrace = records.filter(record => record.context.traceId === traceId);
    assert.equal(recordsForTrace.filter(record => record.message === traceId).length, 2);
    const nested = recordsForTrace.filter(record => record.context.operation === 'nested');
    assert.equal(nested.length, 3);
    assert.ok(nested.every(record => record.context.parentOperationId));
  }
  assert.equal(records.find(record => record.message === 'outside').context.traceId, undefined);
});

test('manager attachment is deduplicated and close removes every installed event listener', async t => {
  const { createPlayer } = require('./helpers/player.cjs');
  const { manager, node, player } = createPlayer(t);
  const { logger, records } = capture();
  const detach = logger.attachManager(manager);
  assert.equal(logger.attachManager(manager), detach);
  manager.emit('trackStart', player, null);
  await logger.close();
  manager.emit('trackStart', player, null);
  manager.emit('nodeError', node, new Error('after close'));
  assert.equal(records.filter(record => record.event === 'track.started').length, 1);
});

test('manager shutdown flushes its owned logger and closes destinations once', async t => {
  const { createPlayer } = require('./helpers/player.cjs');
  const { manager } = createPlayer(t);
  const calls = [];
  manager.logger = new Logger({ level: 'info', transports: [{ write(record) { calls.push(record.message); }, close() { calls.push('closed'); } }] });
  manager.logger.info('Node', 'queued before shutdown');
  await Promise.all([manager.shutdown(), manager.shutdown()]);
  assert.ok(calls.includes('queued before shutdown'));
  assert.equal(calls.filter(call => call === 'closed').length, 1);
});
