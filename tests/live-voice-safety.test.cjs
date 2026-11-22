const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { validateConfiguration } = require('../scripts/test-live-voice.cjs');

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
