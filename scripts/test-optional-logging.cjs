// Run after installing the two pinned test-only packages in an ignored prefix:
// npm install --prefix .runtime/optional-adapters --ignore-scripts --no-audit --no-fund --no-save pino@10.4.0 @opentelemetry/api@1.10.0
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { Writable } = require('node:stream');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const prefix = path.join(root, '.runtime/optional-adapters');
const external = createRequire(path.join(prefix, 'probe.cjs'));
(async () => {
  const pino = external('pino');
  const { trace, metrics } = external('@opentelemetry/api');
  const { Logger, PinoLogTransport, OpenTelemetryLogTransport } = require('../dist');
  const lines = [];
  const sink = new Writable({ write(chunk, _encoding, callback) { lines.push(String(chunk)); callback(); } });
  const appLogger = pino({ level: 'trace', base: null }, sink);
  const logger = new Logger({ level: 'trace', transports: [new PinoLogTransport(appLogger),
    new OpenTelemetryLogTransport(trace.getTracer('nyxlink-test'), metrics.getMeter('nyxlink-test').createCounter('nyxlink_logs'))] });
  logger.event('warn', 'Node', 'node.warning', { token: 'PRIVATE_TOKEN_CANARY' });
  await logger.traceOperation('installed-pino-otel', async () => 42);
  await logger.close();
  const records = lines.join('').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(records.filter(record => record.nyxlink.event === 'node.warning').length, 1);
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE_TOKEN_CANARY/);
  assert.equal(sink.destroyed, false);
  const sdk = path.join(root, 'dist/index').replaceAll('\\', '/');
  await fs.writeFile(path.join(prefix, 'types.ts'), `import pino from 'pino';\nimport {trace,metrics} from '@opentelemetry/api';\nimport {PinoLogTransport,OpenTelemetryLogTransport} from ${JSON.stringify(sdk)};\nnew PinoLogTransport(pino());\nnew OpenTelemetryLogTransport(trace.getTracer('test'),metrics.getMeter('test').createCounter('logs'));\n`);
  const types = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', path.join(prefix, 'types.ts')], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(types.status, 0, types.stdout + types.stderr);
  const report = { node: process.version, pino: external('pino/package.json').version, telemetry: '1.10.0', passed: true, checks: ['real Pino NDJSON/redaction/flush', 'real OTel API interop without global provider', 'structural TypeScript compatibility', 'application stream remains open'] };
  await fs.writeFile(path.join(prefix, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
