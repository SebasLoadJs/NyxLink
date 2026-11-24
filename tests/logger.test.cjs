const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function run(source) {
  const result = spawnSync(process.execPath, ['-e', source], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

test('Logger defaults to silent, including banner, status and failover panels', () => {
  const output = run(`const {Logger}=require('./dist'); const logger=new Logger(); logger.info('test','hidden'); logger.banner(); logger.systemStatus([]); logger.failover({source:'a',target:'b',status:'failed'});`);
  assert.equal(output.stdout, '');
  assert.equal(output.stderr, '');
});

test('opt-in combined logger prints module messages and the NYXLINK banner', () => {
  const output = run(`const {Logger}=require('./dist'); const logger=new Logger({level:'info',color:false,timestamps:false}); logger.info('Node','connected'); logger.banner();`);
  assert.match(output.stdout, /INFO\s+\[Node\] connected/);
  assert.match(output.stdout, /AUDIO CLIENT/);
  assert.doesNotMatch(output.stdout, /\x1b\[/);
});

test('manager logging is silent without opt-in and preserves raw debug events', () => {
  const output = run(`const {Manager}=require('./dist'); const m=new Manager({nodes:[{host:'127.0.0.1',port:2333,password:'test',secure:false}]}); let seen; m.on('debug',message=>seen=message); m.emit('debug','raw-test-message'); if(seen!=='raw-test-message') throw new Error('debug lost');`);
  assert.equal(output.stdout, '');
  assert.equal(output.stderr, '');
});

test('attached manager logger shows real node counts and detaches all its listeners', () => {
  const output = run(`
    const {Manager,Logger}=require('./dist');
    const m=new Manager({nodes:[{identifier:'measured-node',host:'127.0.0.1',port:2333,password:'test',secure:false}]});
    m.nodes.add({identifier:'measured-node',host:'127.0.0.1',port:2333,password:'test',secure:false});
    const logger=new Logger({level:'debug',color:false,timestamps:false});
    const detach=logger.attachManager(m);
    m.emit('debug','Moonlink.js > Node >> visible-before-detach');
    logger.managerStatus(m);
    detach(); detach();
    m.emit('debug','Moonlink.js > Node >> hidden-after-detach');
    m.emit('nodeConnected',m.nodes.nodes.get('measured-node'));
  `);
  assert.match(output.stdout, /visible-before-detach/);
  assert.match(output.stdout, /SYSTEM STATUS/);
  assert.match(output.stdout, /measured-node/);
  assert.match(output.stdout, /0 players/);
  assert.match(output.stdout, /ATTENTION/);
  assert.doesNotMatch(output.stdout, /hidden-after-detach/);
  assert.equal((output.stdout.match(/SYSTEM STATUS/g) || []).length, 1);
});

test('manager options can opt into logging without printing an automatic banner', () => {
  const output = run(`const {Manager}=require('./dist'); const m=new Manager({nodes:[{host:'127.0.0.1',port:2333,password:'test',secure:false}],options:{logging:{level:'debug',color:false,timestamps:false}}}); m.emit('debug','Moonlink.js > Player >> enabled-by-config');`);
  assert.match(output.stdout, /enabled-by-config/);
  assert.doesNotMatch(output.stdout, /AUDIO CLIENT/);
});

test('failover panel follows the confirmed failure result and never prints Recovered', () => {
  const output = run(`
    const {Manager,Node,Player,Logger,NodeState}=require('./dist');
    const m=new Manager({nodes:[{identifier:'old',host:'127.0.0.1',port:2333,password:'test',secure:false}]});
    m.database={set:async()=>{}};
    m.nodes.add({identifier:'old',host:'127.0.0.1',port:2333,password:'test',secure:false});
    const old=m.nodes.nodes.get('old'); old.rest.destroyPlayer=async()=>{};
    const target=new Node(m,{identifier:'target',host:'127.0.0.2',port:2333,password:'test',secure:false}); target.connected=true; target.state=NodeState.READY;
    const p=new Player(m,old,{guildId:'123456789012345678',voiceChannelId:'223456789012345678'}); p.stopHealthCheck(); p.restart=async()=>false;
    new Logger({level:'info',color:false}).attachManager(m);
    p.transferNode(target).then(result=>{if(result)throw new Error('false success');});
  `);
  assert.match(output.stdout, /In progress/);
  assert.match(output.stdout, /Failed/);
  assert.doesNotMatch(output.stdout, /Recovered/);
});

test('opt-in logger redacts credentials from strings, objects and errors', () => {
  const output = run("const {Logger}=require('./dist'); const log=new Logger({level:'debug',color:false,timestamps:false}); log.debug('Node','Authorization: Bearer bearer-secret-987 password=pass-secret-987'); log.info('Request',{token:'object-token-987',apiKey:'object-api-987'}); log.error('Backend',new Error('access_token=query-secret-987'))");
  const all = output.stdout + output.stderr;
  for (const secret of ['bearer-secret-987','pass-secret-987','object-token-987','object-api-987','query-secret-987']) {
    assert.equal(all.includes(secret), false, 'Secret leaked: ' + secret);
  }
  assert.match(all, /\[REDACTED\]/);
  assert.match(all, /Backend/);
});

test('opt-in logger preserves ordinary text while redacting JSON keys', () => {
  const output = run("const {Logger}=require('./dist'); const log=new Logger({level:'info',color:false,timestamps:false}); log.info('HTTP', 'Response 401: {\"token\":\"json-secret-987\",\"status\":\"denied\"}')");
  assert.match(output.stdout, /Response 401/);
  assert.match(output.stdout, /denied/);
  assert.doesNotMatch(output.stdout, /json-secret-987/);
});

test('structured logger uses sanitized records, respects levels and can disable console output', () => {
  const output = run(`
    const assert = require('node:assert/strict');
    const {Logger,createPinoSink}=require('./dist');
    const calls=[];
    const target=Object.fromEntries(['error','warn','info','debug','trace'].map(level=>[level,(record,message)=>calls.push({level,record,message})]));
    const log=new Logger({level:'info',console:false,sink:createPinoSink(target)});
    log.debug('Node','hidden');
    log.info('Node password=tag-secret-987','connected',{token:'payload-secret-987'});
    log.warn('Node','warning');
    log.failover({source:'password=source-secret-987',target:'new',status:'failed',reason:'token=reason-secret-987'});
    assert.deepEqual(calls.map(c=>c.level),['info','warn','info']);
    assert.match(calls[0].record.module,/REDACTED/);
    assert.match(calls[0].message,/connected/);
    assert.match(calls[2].message,/Failed/);
    assert.doesNotMatch(JSON.stringify(calls),/tag-secret-987|payload-secret-987|source-secret-987|reason-secret-987|hidden/);
    assert.ok(calls.every(c=>Number.isFinite(Date.parse(c.record.timestamp))));
  `);
  assert.equal(output.stdout,'');
  assert.equal(output.stderr,'');
});

test('structured logger remains silent by default and isolates throwing sinks', () => {
  const output=run(`
    const assert=require('node:assert/strict');
    const {Logger}=require('./dist');
    let count=0;
    const log=new Logger({console:false,sink:()=>{count++;throw Error('sink failed')}});
    log.error('Node','hidden');log.banner();
    assert.equal(count,0);
    log.setLevel('info');log.info('Node','observed');log.banner();
    assert.equal(count,2);
  `);
  assert.equal(output.stdout,'');
  assert.equal(output.stderr,'');
});

test('console status and failover panels redact credentials before wrapping', () => {
  const output=run(`
    const {Logger}=require('./dist');
    const log=new Logger({level:'info',color:false,width:44});
    log.systemStatus([{name:'password=very-long-node-password-canary-987654321',backend:'NodeLink',state:'ready'}]);
    log.failover({source:'old',target:'new',status:'failed',reason:'token=very-long-failover-token-canary-987654321'});
  `);
  assert.doesNotMatch(output.stdout,/canary|987654321|very-long/);
  assert.match(output.stdout,/REDACTED/);
});

test('legacy boxes and quoted multiword credentials are redacted before wrapping', () => {
  const { formatBox, redactSecrets, formatValue } = require('../dist/src/logging/LogFormatter');
  const text = 'password="multi word secret" token=\x60another private value\x60 status=ok';
  const cleaned = redactSecrets(text);
  assert.doesNotMatch(cleaned, /multi word secret|another private value/);
  assert.equal(redactSecrets(cleaned), cleaned);
  assert.match(cleaned, /status=ok/);
  assert.doesNotMatch(formatBox('diagnostics', { password: 'box-secret-123', token: 'box-token-456', status: 'ok' }), /box-secret|box-token/);
  const value = { [Symbol.for('nodejs.util.inspect.custom')]() { throw Error('custom inspector executed'); }, token: 'nested secret value' };
  assert.doesNotMatch(formatValue(value), /nested secret value/);
});

test('URL userinfo redaction is linear on adversarial repeated separators', () => {
  const source = [
    "const assert=require('node:assert/strict');",
    "const {redactSecrets}=require('./dist/src/logging/LogFormatter.js');",
    "assert.equal(redactSecrets('https://user:password@example.com'), 'https://[REDACTED]@example.com');",
    "assert.equal(redactSecrets('ftp+ssh://bot:secret@example.net'), 'ftp+ssh://[REDACTED]@example.net');",
    "assert.equal(redactSecrets('https://example.com/normal/path'), 'https://example.com/normal/path');",
    "assert.equal(redactSecrets('https://u:p@host.test and http://x:y@server.test'), 'https://[REDACTED]@host.test and http://[REDACTED]@server.test');",
    "const long='!:'.repeat(100000)+'https://login:PRIVATE_URL_SECRET@example.net';",
    "const result=redactSecrets(long);",
    "assert.equal(result.endsWith('https://[REDACTED]@example.net'), true);",
    "assert.equal(result.includes('PRIVATE_URL_SECRET'), false);",
    "assert.equal(result.startsWith('!:'), true);",
  ].join('\n');
  const result = spawnSync(process.execPath, ['-e', source], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error || 'timeout'));
});
