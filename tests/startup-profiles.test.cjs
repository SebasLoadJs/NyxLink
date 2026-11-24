const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { Manager, Logger } = require('../dist');

test('startup is opt-in and exposes observed unknown readiness without inventing a healthy cluster', async () => {
  const manager = new Manager({ nodes: [{ identifier: 'node-a', host: '127.0.0.1', port: 2333, password: 'PRIVATE_PASSWORD' }] });
  const records = [];
  const logger = new Logger({ level: 'info', transports: [{ write: record => records.push(record) }] });
  logger.startup(manager); await logger.close();
  assert.equal(records.length, 1); assert.equal(records[0].event, 'startup.snapshot');
  assert.equal(records[0].context.readyNodes, 0); assert.equal(records[0].context.initialized, false);
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE_PASSWORD|HEALTHY|configuration.*validated/i);
});

test('startup layouts, truecolor, FORCE_COLOR and NO_COLOR remain separate from JSON output', () => {
  const source = `const {Manager,Logger}=require('./dist'); const m=new Manager({nodes:[{host:'127.0.0.1',port:2333,password:'fixture'}]}); const l=new Logger(JSON.parse(process.argv[1])); l.startup(m); l.info('Core','test'); l.close();`;
  function run(options, extraEnv = {}) {
    const env = { ...process.env }; delete env.NO_COLOR; delete env.FORCE_COLOR;
    const result = spawnSync(process.execPath, ['-e', source, JSON.stringify(options)], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  }
  for (const layout of ['compact','standard','detailed','diagnostic']) {
    const output = run({ level: 'info', layout, color: false, unicode: false });
    assert.match(output, /NYXLINK/); assert.doesNotMatch(output, /[┌─│]|\x1b\[/);
    if (layout === 'compact') assert.doesNotMatch(output, /STARTUP|Topology/);
    else assert.match(output, /STARTUP/);
    if (layout === 'diagnostic') assert.match(output, /Platform/);
  }
  assert.match(run({ level: 'info' }, { FORCE_COLOR: '3' }), /\x1b\[38;2;/);
  assert.doesNotMatch(run({ level: 'info' }, { FORCE_COLOR: '3', NO_COLOR: '' }), /\x1b\[/);
  const json = run({ level: 'info', mode: 'json' }, { FORCE_COLOR: '3' });
  assert.doesNotMatch(json, /\x1b\[/); assert.ok(json.trim().split('\n').every(line => JSON.parse(line)));
});
