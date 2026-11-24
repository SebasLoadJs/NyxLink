const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function run(source) {
  const result = spawnSync(process.execPath, ['-e', source], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

test('manager logging is silent without opt-in and preserves raw debug events', () => {
  const output = run(`const {Manager}=require('./dist'); const m=new Manager({nodes:[{host:'127.0.0.1',port:2333,password:'test',secure:false}]}); let seen; m.on('debug',message=>seen=message); m.emit('debug','raw-test-message'); if(seen!=='raw-test-message') throw new Error('debug lost');`);
  assert.equal(output.stdout, '');
  assert.equal(output.stderr, '');
});

test('canonical manager route never consumes raw debug and detaches independently of unrelated listeners',()=>{
 const output=run(`
 const {Manager}=require('./dist');
 const m=new Manager({nodes:[{host:'127.0.0.1',port:2333,password:'test',secure:false}],options:{logging:{level:'debug',target:Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(l=>[l,(event,message)=>process.stdout.write(message+'\\n')]))}}});
 m.emit('debug','PRIVATE_RAW');
 m.emit('nodeReady',{backend:{kind:'nodelink'}},{});
 m.detachLogger();m.emit('nodeReady',{backend:{kind:'lavalink'}},{});
 `);
 assert.equal((output.stdout.match(/Backend session ready/g)||[]).length,1);
 assert.doesNotMatch(output.stdout,/PRIVATE_RAW|AUDIO CLIENT/);
});
test('canonical failover reports actual failure without claiming recovery',()=>{
 const output=run(`
 const {Manager,Node,Player,NodeState}=require('./dist');
 const m=new Manager({nodes:[{identifier:'old',host:'127.0.0.1',port:2333,password:'test',secure:false}],options:{logging:{level:'info',target:Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(l=>[l,(event,message)=>process.stdout.write(message+'\\n')]))}}});
 m.database={set:async()=>{}};
 m.nodes.add({identifier:'old',host:'127.0.0.1',port:2333,password:'test',secure:false});
 const old=m.nodes.nodes.get('old');old.rest.destroyPlayer=async()=>{};
 const target=new Node(m,{identifier:'target',host:'127.0.0.2',port:2333,password:'test',secure:false});target.connected=true;target.state=NodeState.READY;
 const p=new Player(m,old,{guildId:'123456789012345678',voiceChannelId:'223456789012345678'});p.stopHealthCheck();p.restart=async()=>false;
 p.transferNode(target).then(result=>{if(result)throw Error('false success');});
 `);
 assert.match(output.stdout,/Recovery initiated/);assert.match(output.stdout,/Recovery failed/);assert.doesNotMatch(output.stdout,/Recovery confirmed/);
});
test('pure diagnostic boxes and quoted multiword credentials are redacted before wrapping', () => {
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
