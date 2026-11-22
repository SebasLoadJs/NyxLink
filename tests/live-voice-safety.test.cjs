const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { validateConfiguration, redactDiagnostic, event } = require('../scripts/test-live-voice.cjs');

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

test('live voice diagnostics redact credentials, controlled audio URLs and encoded tracks',()=>{
 const env=config();
 const settings=validateConfiguration(env,['--armed']);
 const encodedUrl=encodeURIComponent(env.NYXLINK_LIVE_TRACK_A);
 const leaked = [settings.token,settings.node.password,...settings.urls,
   encodedUrl,'encoded-track-private'].join(' | ');
 const output=redactDiagnostic(new Error(leaked),settings,['encoded-track-private']);
 for (const sensitive of [settings.token,settings.node.password,...settings.urls,
   encodedUrl,'encoded-track-private']) assert.equal(output.includes(sensitive),false);
 assert.match(output,/\\[REDACTED\\]/);
 assert.equal(redactDiagnostic(new Error('redirected to https://other.example/token?secret=123'),
   settings).includes('https://other.example'),false);
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
