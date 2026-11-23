const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { validateConfiguration, errorCode, event, writePrivateReport, reportPath, sourceRevision, buildForLiveVoice, safeBackendVersion, safeTrackEndReason, evaluateCrossfadeEvents } = require('../scripts/test-live-voice.cjs');

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

test('source revision is a canonical Git SHA or explicitly unavailable', () => {
  const revision = sourceRevision();
  assert.ok(revision === null || /^[0-9a-f]{40}$/.test(revision));
  if (revision !== null) {
    const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 3000,
    });
    assert.equal(result.status, 0);
    assert.equal(revision, result.stdout.trim());
  }
});

test('source revision rejects modified and untracked source in a disposable Git repository', async t => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) {
    t.skip('Git binary unavailable');
    return;
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxlink-evidence-git-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', directory, ...args], {
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  };
  git('init', '-q');
  const tracked = path.join(directory, 'music.js');
  await fs.writeFile(tracked, 'module.exports = 1;\n');
  git('add', 'music.js');
  git('-c', 'user.name=NyxLink Test', '-c', 'user.email=test@example.invalid',
    'commit', '-qm', 'fixture');
  const expected = git('rev-parse', 'HEAD');
  assert.equal(sourceRevision(directory), expected);
  await fs.writeFile(tracked, 'module.exports = 2;\n');
  assert.equal(sourceRevision(directory), null, 'modified tracked code is not immutable');
  git('restore', 'music.js');
  assert.equal(sourceRevision(directory), expected);
  await fs.writeFile(path.join(directory, 'untracked.js'), 'module.exports = 3;\n');
  assert.equal(sourceRevision(directory), null, 'untracked source is not immutable');
});

test('crossfade lab rejects an ordinary handoff even when both tracks start in order', () => {
  const events = [
    { type: 'trackStart', track: 'A' },
    { type: 'trackEnd', track: 'A', reason: 'finished' },
    { type: 'trackStart', track: 'B' },
  ];
  const result = evaluateCrossfadeEvents(events, 0);
  assert.equal(result.observed, true);
  assert.equal(result.crossfadeEventObserved, false);
  assert.equal(result.success, false);
});

test('crossfade lab accepts ordered starts with a crossfading end for track A', () => {
  const events = [
    { type: 'trackStart', track: 'A' },
    { type: 'trackEnd', track: 'A', reason: 'crossfading' },
    { type: 'trackStart', track: 'B' },
  ];
  assert.deepEqual(evaluateCrossfadeEvents(events, 0), {
    observed: true,
    transitionReasons: ['crossfading'],
    crossfadeEventObserved: true,
    remainingQueue: 0,
    success: true,
  });
  assert.equal(evaluateCrossfadeEvents(events, 1).success, false);
});

test('crossfade lab does not accept duplicate starts or unrelated crossfading events', () => {
  const wrongTrack = [
    { type: 'trackStart', track: 'A' },
    { type: 'trackEnd', track: 'B', reason: 'crossfading' },
    { type: 'trackStart', track: 'B' },
  ];
  assert.equal(evaluateCrossfadeEvents(wrongTrack, 0).success, false);
  assert.equal(evaluateCrossfadeEvents([...wrongTrack, { type: 'trackStart', track: 'B' }], 0).success, false);
  assert.throws(() => evaluateCrossfadeEvents({}, 0), TypeError);
});

test('generated TypeScript output must not invalidate a clean source revision', async t => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) {
    t.skip('Git binary unavailable');
    return;
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxlink-build-attribution-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  };
  git('init', '-q');
  await fs.mkdir(path.join(directory, 'dist'));
  await fs.writeFile(path.join(directory, 'index.ts'), 'export const value = 1;\n');
  await fs.writeFile(path.join(directory, 'dist', 'index.js'), 'exports.value = 0;\n');
  git('add', '.');
  git('-c', 'user.name=NyxLink Test', '-c', 'user.email=test@example.invalid',
    'commit', '-qm', 'fixture');
  const revision = git('rev-parse', 'HEAD');
  assert.equal(sourceRevision(directory), revision);

  // The tracked output is intentionally behind the TypeScript and changes
  // whenever the acceptance harness recompiles it.
  await fs.writeFile(path.join(directory, 'dist', 'index.js'), 'exports.value = 1;\n');
  await fs.writeFile(path.join(directory, 'dist', 'new-output.js'), 'module.exports = true;\n');
  assert.equal(sourceRevision(directory), revision);
  await fs.writeFile(path.join(directory, 'index.ts'), 'export const value = 2;\n');
  assert.equal(sourceRevision(directory), null, 'modified source must invalidate revision evidence');
});

test('live voice compiles fresh JavaScript from a clean source revision before returning its SHA', async t => {
  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) {
    t.skip('Git binary unavailable');
    return;
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nyxlink-live-rebuild-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  };
  const bin = path.join(directory, 'node_modules', 'typescript', 'bin');
  await fs.mkdir(bin, { recursive: true });
  await fs.mkdir(path.join(directory, 'dist'), { recursive: true });
  await fs.writeFile(path.join(directory, 'index.ts'), 'fresh-source');
  await fs.writeFile(path.join(directory, 'dist', 'index.js'), 'stale-compiled-code');
  await fs.writeFile(path.join(bin, 'tsc'),
    "const fs=require('node:fs'); fs.writeFileSync('dist/index.js',fs.readFileSync('index.ts','utf8'));\n");
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=NyxLink Test', '-c', 'user.email=test@example.invalid',
    'commit', '-qm', 'fixture');
  const revision = git('rev-parse', 'HEAD');
  assert.equal(buildForLiveVoice(directory), revision);
  assert.equal(await fs.readFile(path.join(directory, 'dist', 'index.js'), 'utf8'), 'fresh-source');
  await fs.writeFile(path.join(directory, 'index.ts'), 'uncommitted source');
  assert.throws(() => buildForLiveVoice(directory), /dirty or unverifiable source checkout/);
});
