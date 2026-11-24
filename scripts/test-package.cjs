const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');
const baseline = require('../tests/fixtures/public-exports.json');
const { validateReleaseManifest } = require('./release-policy.cjs');
const fromRegistry = process.argv.includes('--registry');
assert.ok(process.argv.slice(2).every(argument => argument === '--registry'), 'Usage: node scripts/test-package.cjs [--registry]');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120000, env: { ...process.env, CI: 'false', COREPACK_ENABLE_PROJECT_SPEC: '0' } });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed: ${result.stderr || result.stdout || result.error?.message}`);
  return result;
}

async function main() {
  validateReleaseManifest(manifest);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxlink-package-'));
  const checks = [];
  let passed = false;
  let archive;
  try {
    if (!fromRegistry) {
      const packed = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', directory], root);
      const [description] = JSON.parse(packed.stdout);
      archive = path.join(directory, description.filename);
      assert.equal(path.dirname(archive), directory);
    }
    const consumer = path.join(directory, 'consumer');
    await fs.mkdir(consumer);
    const types = require('../node_modules/@types/node/package.json').version;
    const compiler = require('../node_modules/typescript/package.json').version;
    const discord = require('../node_modules/discord.js/package.json').version;
    await fs.writeFile(path.join(consumer, 'package.json'), JSON.stringify({ private: true, packageManager: manifest.packageManager,
      dependencies: { [manifest.name]: fromRegistry ? manifest.version : `file:${archive}` }, devDependencies: { '@types/node': types, typescript: compiler, 'discord.js': discord,
        consola: '3.4.2', pino: '10.4.0', 'pino-pretty': '13.2.0', '@opentelemetry/api': '1.9.0',
        '@opentelemetry/sdk-trace-base': '2.2.0', '@opentelemetry/sdk-metrics': '2.2.0', '@opentelemetry/context-async-hooks': '2.2.0',
        '@opentelemetry/sdk-node': '0.208.0', '@opentelemetry/instrumentation-pino': '0.55.1',
        '@opentelemetry/exporter-trace-otlp-http': '0.208.0', '@opentelemetry/exporter-metrics-otlp-http': '0.208.0',
        figlet: '1.9.4', 'gradient-string': '3.0.0', chalk: '5.6.2', boxen: '8.0.1',
        'string-width': '7.2.0', 'strip-ansi': '7.1.2', 'pretty-ms': '9.2.0', 'log-symbols': '7.0.1',
        listr2: '8.3.3', ora: '8.2.0', 'cli-progress': '3.12.0',
        'cli-table3': '0.6.5', 'pretty-bytes': '6.1.1', 'log-update': '6.1.0', ink: '5.2.1', react: '18.3.1', 'ink-testing-library': '4.0.0' } }));
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    run(pnpm, ['install', fromRegistry ? '--prefer-offline=false' : '--prefer-offline', ...(fromRegistry ? ['--force'] : []), '--registry=https://registry.npmjs.org/', '--ignore-scripts', '--no-frozen-lockfile'], consumer);
    checks.push(fromRegistry ? 'install exact published version from public npm in isolated consumer' : 'install packed artifact in isolated consumer');
    const installed = path.join(consumer, 'node_modules', ...manifest.name.split('/'));
    assert.notEqual(await fs.realpath(installed), root, 'Consumer must use the packed copy');
    const actual = JSON.parse(await fs.readFile(path.join(installed, 'package.json'), 'utf8'));
    assert.equal(actual.name, manifest.name); assert.equal(actual.version, manifest.version); assert.equal(actual.private, manifest.private);
    assert.deepEqual(actual.publishConfig, manifest.publishConfig);
    assert.deepEqual(actual.dependencies, manifest.dependencies);
    const license = await fs.readFile(path.join(installed, 'LICENSE'));
    assert.deepEqual(license, await fs.readFile(path.join(root, 'LICENSE')));
    const attribution = await fs.readFile(path.join(installed, 'NOTICE.md'), 'utf8');
    assert.equal(attribution, await fs.readFile(path.join(root, 'NOTICE.md'), 'utf8'));
    assert.match(attribution, /Moonlink\.js/);
    assert.match(attribution, /Ecliptia\/moonlink\.js/);
    checks.push('identity, runtime dependencies, license and upstream attribution bytes');
    const specifier = JSON.stringify(manifest.name);
    const setup = `const assert = require('node:assert/strict'); const api = require(${specifier});
      for (const name of ${JSON.stringify(baseline)}) assert.ok(name in api, name);
      for (const name of ['PlayerSnapshotCodec', 'SnapshotConflictError', 'SnapshotValidationError']) assert.equal(typeof api[name], 'function');
      assert.equal(api.version, ${JSON.stringify(manifest.version)});
      for (const name of ['RedisStorage', 'RedisGuildLeaseCoordinator', 'RedisGuildIpcRouter', 'PrivateMetricsServer']) assert.equal(typeof api[name], 'function');
      const m = new api.Manager({nodes:[{host:'127.0.0.1',port:2333,password:'local-fixture'}],options:{database:{type:'memory'}}});
      assert.ok(m.options.clientName.startsWith('NyxLink/'));
      m.shutdown().catch(error=>{console.error(error);process.exitCode=1});`;
    await fs.writeFile(path.join(consumer, 'commonjs.cjs'), setup);
    const commonjs = run(process.execPath, ['commonjs.cjs'], consumer);
    assert.equal(commonjs.stdout, ''); assert.equal(commonjs.stderr, '');
    checks.push('CommonJS public exports, metadata and silent lifecycle');
    await fs.writeFile(path.join(consumer, 'esm.mjs'), `import assert from 'node:assert/strict';
      import { Manager, Track, TrackCodec, TrackResolver, Memory, PlayerSnapshotCodec, SnapshotConflictError, RedisStorage, RedisGuildLeaseCoordinator, RedisGuildIpcRouter, PrivateMetricsServer, version } from ${specifier};
      assert.equal(version, ${JSON.stringify(manifest.version)});
      assert.equal(typeof Track, 'function'); assert.equal(typeof TrackCodec.serialize, 'function'); assert.equal(typeof TrackResolver.resolve, 'function');
      for (const component of [RedisStorage, RedisGuildLeaseCoordinator, RedisGuildIpcRouter, PrivateMetricsServer]) assert.equal(typeof component, 'function');
      const adapter = new Memory(); await adapter.set('fixture', 7); assert.equal(await adapter.get('fixture'), 7);
      assert.equal(await adapter.compareAndSet('record', null, { revision: 'installed-revision' }), true);
      assert.equal(PlayerSnapshotCodec.fromRecord({guildId:'123456789012345678',voiceChannelId:'223456789012345678'}).schemaVersion, 1);
      assert.equal(new SnapshotConflictError().code, 'SNAPSHOT_CONFLICT');
      const manager = new Manager({nodes:[{host:'127.0.0.1',port:2333,password:'local-fixture'}],options:{database:{type:'memory'}}}); await manager.shutdown();`);
    const esm = run(process.execPath, ['esm.mjs'], consumer);
    assert.equal(esm.stdout, ''); assert.equal(esm.stderr, '');
    checks.push('ESM named imports and lifecycle');
    const fixture = (await fs.readFile(path.join(root, 'tests/types/public-api.ts'), 'utf8')).replaceAll("'../../dist'", specifier);
    for (const extension of ['cts', 'mts']) await fs.writeFile(path.join(consumer, `consumer.${extension}`), fixture);
    const tsc = path.join(consumer, 'node_modules/typescript/bin/tsc');
    run(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.cts', 'consumer.mts'], consumer);
    checks.push('TypeScript NodeNext CJS/ESM consumers without skipLibCheck');
    await fs.copyFile(path.join(root, 'tests/fixtures/observability-consumer.cts'), path.join(consumer, 'observability-consumer.cts'));
    run(process.execPath, [tsc, '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'observability-consumer.cts'], consumer);
    const observability = run(process.execPath, ['observability-consumer.cjs'], consumer);
    assert.equal(observability.stdout, ''); assert.equal(observability.stderr, '');
    checks.push('real Pino/Pino Pretty and OpenTelemetry SDK types, runtime, privacy and cleanup');
    await fs.copyFile(path.join(root, 'examples/aurora-visual.mjs'), path.join(consumer, 'aurora-visual.mjs'));
    await fs.copyFile(path.join(root, 'tests/fixtures/aurora-visual-consumer.mjs'), path.join(consumer, 'aurora-visual-consumer.mjs'));
    const visual = run(process.execPath, ['aurora-visual-consumer.mjs'], consumer);
    assert.equal(visual.stdout, ''); assert.equal(visual.stderr, '');
    checks.push('real optional Aurora visual tools and 40/80/120 column static rendering');
    await fs.copyFile(path.join(root, 'examples/aurora-bootstrap.mjs'), path.join(consumer, 'aurora-bootstrap.mjs'));
    await fs.copyFile(path.join(root, 'tests/fixtures/aurora-bootstrap-consumer.mjs'), path.join(consumer, 'aurora-bootstrap-consumer.mjs'));
    const bootstrap = run(process.execPath, ['aurora-bootstrap-consumer.mjs'], consumer);
    assert.equal(bootstrap.stdout, ''); assert.equal(bootstrap.stderr, '');
    checks.push('real optional Listr2, Ora and CLI Progress bootstrap adapter');
    await fs.copyFile(path.join(root, 'examples/aurora-diagnostics.mjs'), path.join(consumer, 'aurora-diagnostics.mjs'));
    await fs.copyFile(path.join(root, 'tests/fixtures/aurora-diagnostics-consumer.mjs'), path.join(consumer, 'aurora-diagnostics-consumer.mjs'));
    const diagnostics = run(process.execPath, ['aurora-diagnostics-consumer.mjs'], consumer);
    assert.equal(diagnostics.stdout, ''); assert.equal(diagnostics.stderr, '');
    checks.push('real optional diagnostic table, units and static music strip');
    await fs.copyFile(path.join(root, 'examples/aurora-inspector.mjs'), path.join(consumer, 'aurora-inspector.mjs'));
    await fs.copyFile(path.join(root, 'tests/fixtures/aurora-inspector-consumer.mjs'), path.join(consumer, 'aurora-inspector-consumer.mjs'));
    const inspector = run(process.execPath, ['aurora-inspector-consumer.mjs'], consumer);
    assert.equal(inspector.stdout, ''); assert.equal(inspector.stderr, '');
    checks.push('real Ink inspector five views and non-TTY fallback');
    await fs.copyFile(path.join(root,'examples/aurora-otel.mjs'),path.join(consumer,'aurora-otel.mjs'));
    await fs.copyFile(path.join(root,'tests/fixtures/aurora-otel-consumer.mjs'),path.join(consumer,'aurora-otel-consumer.mjs'));
    const tracing = run(process.execPath,['aurora-otel-consumer.mjs'],consumer);
    assert.equal(tracing.stdout,''); assert.equal(tracing.stderr,'');
    checks.push('real active OTel parent-child spans and Pino correlation in inspector');
    await fs.copyFile(path.join(root,'examples/aurora-pipeline.mjs'),path.join(consumer,'aurora-pipeline.mjs'));
    await fs.copyFile(path.join(root,'tests/fixtures/aurora-pipeline-consumer.mjs'),path.join(consumer,'aurora-pipeline-consumer.mjs'));
    const pipeline = run(process.execPath,['aurora-pipeline-consumer.mjs'],consumer);
    assert.equal(pipeline.stdout,''); assert.equal(pipeline.stderr,'');
    checks.push('exclusive Pino JSON/Pretty/Aurora/Custom/Silent routing and redaction');
    await fs.copyFile(path.join(root,'examples/aurora-demo.mjs'),path.join(consumer,'aurora-demo.mjs'));
    const demo = run(process.execPath,['aurora-demo.mjs','--format','json','--scenario','startup','--snapshot'],consumer);
    assert.match(demo.stderr,/SIMULATED AURORA DEMO/);
    const demoRecords = demo.stdout.trim().split('\n').map(JSON.parse);
    assert.deepEqual(demoRecords.map(x=>x.eventCode),['NODE_READY','NODE_READY']);
    const visualDemo = run(process.execPath,['aurora-demo.mjs','--scenario','failover','--snapshot'],consumer);
    assert.match(visualDemo.stdout,/FAILOVER RECOVERED/);
    assert.match(visualDemo.stderr,/SIMULATED/);
    assert.doesNotMatch(visualDemo.stdout,/\x1b/);
    checks.push('executable simulated JSON and Aurora scenarios without network or Discord');
    await fs.copyFile(path.join(root,'examples/aurora-sdk.cjs'),path.join(consumer,'aurora-sdk.cjs'));
    await fs.copyFile(path.join(root,'tests/fixtures/aurora-sdk-consumer.cjs'),path.join(consumer,'aurora-sdk-consumer.cjs'));
    const sdk = run(process.execPath,['aurora-sdk-consumer.cjs'],consumer);
    assert.equal(sdk.stdout,''); assert.equal(sdk.stderr,'');
    checks.push('host SDK automatic Pino correlation and local OTLP traces/metrics without duplicate log export');
    const acceptance = path.join(root,'.runtime/aurora-acceptance',process.version);
    await fs.mkdir(acceptance,{recursive:true});
    for(const fixture of ['aurora-pty.py','aurora-pty-region.mjs','aurora-benchmark.mjs','aurora-log-update-pty.mjs'])
      await fs.copyFile(path.join(root,'tests/fixtures',fixture),path.join(consumer,fixture));
    if(process.platform==='linux'){
      const pty = run('python3',['aurora-pty.py',process.execPath,acceptance],consumer);
      assert.match(pty.stdout,/8 sessions passed/);
      checks.push('real Linux PTY: 40/80/120 columns, NO_COLOR, region restore and Ink navigation');
    }
    run(process.execPath,['aurora-benchmark.mjs',path.join(acceptance,'benchmark.json')],consumer);
    checks.push('measured comparative benchmark with exact event counts and no render errors');
    for (const file of ['discordjs.ts', 'discordjs.cjs']) await fs.copyFile(path.join(root, 'examples', file), path.join(consumer, file));
    run(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'discordjs.ts'], consumer);
    await fs.writeFile(path.join(consumer, 'example-smoke.cjs'), `const { createMusicClient } = require('./discordjs.cjs'); const fixture = createMusicClient([{host:'127.0.0.1',port:2333,password:'fixture'}]); fixture.close().catch(error=>{console.error(error);process.exitCode=1});`);
    const example = run(process.execPath, ['example-smoke.cjs'], consumer); assert.equal(example.stdout, ''); assert.equal(example.stderr, '');
    checks.push('TypeScript example compile and CommonJS factory/cleanup without login');
    passed = true;
  } finally {
    const report = { timestamp: new Date().toISOString(), scope: fromRegistry ? 'published public npm installation; no Discord' : 'packed local installation; no registry publication or Discord',
      node: process.version, package: manifest.name, version: manifest.version, private: manifest.private, publishConfig: manifest.publishConfig, passed, checks,
      ...(archive ? { sha256: createHash('sha256').update(await fs.readFile(archive)).digest('hex') } : {}) };
    const reportPath = path.join(root, fromRegistry ? '.runtime/npm-install/report.json' : '.runtime/package/report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    await fs.rm(directory, { recursive: true, force: true });
    console.log(`Installed package validation: ${checks.length} checks, passed=${passed}`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
