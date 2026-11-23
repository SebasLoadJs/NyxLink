const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { validateConfiguration, errorCode, event, writePrivateReport, reportPath, safeBackendVersion, safeTrackEndReason } = require('../scripts/test-live-voice.cjs');

function config(){
 return {
  NYXLINK_DISCORD_BOT_TOKEN:'test-token-never-used',
  NYXLINK_DISCORD_GUILD_ID:'123456789012345678',
  NYXLINK_DISCORD_VOICE_CHANNEL_ID:'223456789012345678',
  NYXLINK_NODE_HOST:'127.0.0.1',
  NYXLINK_NODE_PORT:'2333',
  NYXLINK_NODE_PASSWORD:'test-password-never-used',
  NYXLINK_LIVE_TRACK_A:'https://example.com/a.wav',
  NYXLINK_LIVE_TRACK_B:'https://example.com/b.wav'
 };
}
test('live voice harness is opt-in and never initiates a connection by default',()=>{
 assert.throws(()=>validateConfiguration(config(),[]),/--armed/);
 const result=spawnSync(process.execPath,['scripts/test-live-voice.cjs'],{cwd:process.cwd(),env:{...process.env,...config()},encoding:'utf8',timeout:5000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/--armed/);
 assert.doesNotMatch(result.stderr,/test-token-never-used|test-password-never-used/);
});
test('live voice harness requires valid IDs, safe URLs and bounded test configuration',()=>{
 const valid=validateConfiguration(config(),['--armed']);
 assert.equal(valid.crossfadeMs,5000);
 assert.equal(valid.commandSmoke,false);
 assert.equal(valid.backend,'nodelink');
 assert.equal(validateConfiguration(config(),['--armed','--commands']).commandSmoke,true);
 assert.equal(validateConfiguration({...config(),NYXLINK_LIVE_BACKEND:'lavalink'},['--armed','--commands']).backend,'lavalink');
 assert.equal(validateConfiguration({...config(),NYXLINK_LIVE_BACKEND:'lavalink'},['--armed','--reconnect']).reconnectSmoke,true);
 assert.equal(validateConfiguration(config(),['--armed','--reconnect']).reconnectSmoke,true);
 assert.throws(()=>validateConfiguration(config(),['--reconnect']),/--armed/);
 assert.throws(()=>validateConfiguration(config(),['--commands']),/--armed/);
 assert.throws(()=>validateConfiguration(config(),['--armed','--commands','--reconnect']),/exactly one/);
 assert.throws(()=>validateConfiguration({...config(),NYXLINK_LIVE_BACKEND:'lavalink'},['--armed']),/crossfade requires NodeLink/);
 assert.throws(()=>validateConfiguration({...config(),NYXLINK_LIVE_BACKEND:'unknown'},['--armed','--commands']),/NYXLINK_LIVE_BACKEND/);
 for(const patch of [
  {NYXLINK_DISCORD_GUILD_ID:'wrong'},
  {NYXLINK_NODE_PORT:'65536'},
  {NYXLINK_LIVE_TRACK_B:'https://example.com/a.wav'},
  {NYXLINK_LIVE_TRACK_B:'ftp://example.com/b.wav'},
  {NYXLINK_LIVE_TRACK_A:'https://username:password@example.com/a.wav'},
  {NYXLINK_LIVE_CROSSFADE_MS:'70000'}
 ])assert.throws(()=>validateConfiguration({...config(),...patch},['--armed']));
});
test('missing credentials are reported by variable name only',()=>{
 assert.throws(()=>validateConfiguration({NYXLINK_DISCORD_BOT_TOKEN:'topsecret'},['--armed']),error=>{
   assert.doesNotMatch(error.message,/topsecret/);
   assert.match(error.message,/NYXLINK_NODE_HOST/);
   return true;
 });
});

test('live voice error codes cannot disclose third-party secrets',()=>{
 const secret = [
  'test-token-never-used', 'test-password-never-used',
  'https://example.com/private.wav', 'encoded-track-private'
 ].join(' : ');
 for (const error of [new Error(secret),new TypeError(secret),new RangeError(secret),new SyntaxError(secret)]) {
  const result=errorCode(error);
  assert.ok(['OPERATION_ERROR','TYPE_ERROR','RANGE_ERROR','SYNTAX_ERROR'].includes(result));
  assert.equal(result.includes(secret),false);
 }
 assert.equal(errorCode(new Error('sensitive provider URL: https://example.com')), 'OPERATION_ERROR');
});


test('node readiness waiter removes its listener immediately after cancellation',async()=>{
 const manager=new EventEmitter();
 const waiting=event(manager,'nodeReady',n=>n.id==='expected',5000);
 assert.equal(manager.listenerCount('nodeReady'),1);
 waiting.cancel();
 await assert.rejects(waiting.promise,/Cancelled waiting for nodeReady/);
 assert.equal(manager.listenerCount('nodeReady'),0);
 waiting.cancel();
});

test('node readiness waiter ignores unrelated events and settles only once',async()=>{
 const manager=new EventEmitter();
 const waiting=event(manager,'nodeReady',n=>n.id==='expected',5000);
 manager.emit('nodeReady',{id:'other'});
 assert.equal(manager.listenerCount('nodeReady'),1);
 manager.emit('nodeReady',{id:'expected'});
 assert.deepEqual(await waiting.promise,[{id:'expected'}]);
 assert.equal(manager.listenerCount('nodeReady'),0);
 waiting.cancel();
});

test('node readiness waiter clears itself when the predicate fails',async()=>{
 const manager=new EventEmitter();
 const waiting=event(manager,'nodeReady',()=>{throw new Error('bad event');},5000);
 manager.emit('nodeReady',{id:'expected'});
 await assert.rejects(waiting.promise,/bad event/);
 assert.equal(manager.listenerCount('nodeReady'),0);
});

test('live voice reports replace pre-existing public files with private atomic writes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyxlink-voice-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const target=path.join(dir,'nested','report.json');
 await fs.mkdir(path.dirname(target),{recursive:true});
 await fs.writeFile(target,'previous',{mode:0o644});
 await fs.chmod(target,0o644);
 const report={success:false,audioMeasured:false,events:[]};
 await writePrivateReport(target,report);
 assert.deepEqual(JSON.parse(await fs.readFile(target,'utf8')),report);
 if(process.platform!=='win32')assert.equal((await fs.stat(target)).mode&0o777,0o600);
 const files=await fs.readdir(path.dirname(target));
 assert.deepEqual(files,['report.json']);
});


test('live voice reports whitelist backend version and track-end reason', () => {
  assert.equal(safeBackendVersion('3.10.0-dev.2026-11-15.8'), '3.10.0-dev.2026-11-15.8');
  assert.equal(safeBackendVersion('4.2.2'), '4.2.2');
  for (const value of [
    '4.2.2 password=remote-secret',
    '4.2.2\nAuthorization: Bearer leak',
    'prefix-token-remote-secret',
    'x'.repeat(100),
  ]) {
    assert.equal(safeBackendVersion(value), null);
  }
  assert.equal(safeTrackEndReason('crossfading'), 'crossfading');
  assert.equal(safeTrackEndReason('finished'), 'finished');
  assert.equal(safeTrackEndReason('malicious URL https://internal.test/secret'), 'unrecognized');
});

test('each authorized live voice run receives its own private evidence file', () => {
  const date = new Date('2026-11-23T20:00:00.000Z');
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  const crossfade = reportPath({ backend: 'nodelink' }, date, first);
  const commands = reportPath({ backend: 'nodelink', commandSmoke: true }, date, first);
  const reconnect = reportPath({ backend: 'lavalink', reconnectSmoke: true }, date, first);
  assert.ok(crossfade.endsWith('nodelink-crossfade-2026-11-23T20-00-00.000Z-' + first + '.json'));
  assert.ok(commands.endsWith('nodelink-commands-2026-11-23T20-00-00.000Z-' + first + '.json'));
  assert.ok(reconnect.endsWith('lavalink-reconnect-2026-11-23T20-00-00.000Z-' + first + '.json'));
  assert.notEqual(reportPath({ backend: 'nodelink', commandSmoke: true }, date, second), commands);
  assert.throws(() => reportPath({ backend: '../secrets' }, date, first), TypeError);
  assert.throws(() => reportPath({ backend: 'nodelink' }, new Date('bad'), first), TypeError);
  assert.throws(() => reportPath({ backend: 'nodelink' }, date, '../../escape'), TypeError);
  assert.doesNotMatch(crossfade + commands + reconnect, /password|Bearer|token/);
});
