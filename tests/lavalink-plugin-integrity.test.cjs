const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const pins = require('./integration/backend-servers.json');
const { jarUrl, verifiedJar, installVerifiedPlugins } = require('./helpers/verified-plugin-jars.cjs');

const original = pins.lavalinkPlugins.plugins;
const bytes = Buffer.from('isolated fake plugin bytes - deliberately not a Java class');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const fake = original.map(p => ({...p, sha256}));

function response(content, status = 200, headers = {}) {
  return new Response(content, { status, headers });
}
function fetcherFactory(body = bytes) {
  const calls = [];
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, options });
    return response(body, 200, { 'content-type': 'application/java-archive' });
  }};
}

test('artifact URL is constrained to exact pinned official Maven coordinates', () => {
  const first = jarUrl(fake[0]);
  assert.equal(first.url,
    'https://maven.lavalink.dev/releases/com/github/topi314/lavalyrics/lavalyrics-plugin/1.1.0/lavalyrics-plugin-1.1.0.jar');
  assert.equal(first.filename, 'lavalyrics-plugin-1.1.0.jar');
  assert.throws(() => jarUrl({...fake[0], name: '../escape'}), {code:'PLUGIN_INVALID_PIN'});
  assert.throws(() => jarUrl({...fake[0], dependency:'com.evil:evil:1.1.0'}), {code:'PLUGIN_INVALID_COORDINATES'});
  assert.throws(() => jarUrl({...fake[0], sha256:'not-a-digest'}), {code:'PLUGIN_INVALID_PIN'});
});

test('verified artifact checks the raw bytes and rejects a single modified byte', async () => {
  const {fetcher,calls} = fetcherFactory();
  const result = await verifiedJar(fake[0], fetcher);
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.sha256, sha256);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, 'manual');
  await assert.rejects(verifiedJar({...fake[0],sha256: '0'.repeat(64)}, fetcher),
    { code: 'PLUGIN_ARTIFACT_HASH_MISMATCH' });
});

test('artifact fetch fails closed on HTTP errors, cross-origin redirect and overlong content', async () => {
  await assert.rejects(verifiedJar(fake[0], async () => response('unavailable', 503)),
    {code:'PLUGIN_ARTIFACT_DOWNLOAD_FAILED'});
  await assert.rejects(verifiedJar(fake[0], async () =>
    response(null,302,{location:'https://example.org/internal'})),
    {code:'PLUGIN_ARTIFACT_REDIRECT_REJECTED'});
  await assert.rejects(verifiedJar(fake[0], async () =>
    response('bad',200,{'content-length':'33554433'})),
    {code:'PLUGIN_ARTIFACT_TOO_LARGE'});
  await assert.rejects(verifiedJar(fake[0], async () => { throw new Error('contains private token'); }),
    {code:'PLUGIN_ARTIFACT_DOWNLOAD_FAILED'});
});

test('installer writes only complete verified JARs with restricted permissions', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'nyxlink-verified-jars-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  const {fetcher,calls} = fetcherFactory();
  const artifacts = await installVerifiedPlugins(dir,fake,fetcher);
  assert.equal(calls.length, 2);
  assert.deepEqual(artifacts, fake.map(p => ({file:p.name+'-'+p.version+'.jar',sha256})));
  assert.deepEqual((await fs.readdir(dir)).sort(), artifacts.map(x=>x.file).sort());
  for(const item of artifacts) {
    const filepath = path.join(dir,item.file);
    assert.deepEqual(await fs.readFile(filepath), bytes);
    if(process.platform !== 'win32') assert.equal((await fs.stat(filepath)).mode & 0o777,0o600);
  }
});

test('if the second artifact is tampered, no JAR reaches the plugin directory', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'nyxlink-rejected-jars-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  let count = 0;
  const fetcher = async () => response(++count === 1 ? bytes : Buffer.from('tampered'));
  await assert.rejects(installVerifiedPlugins(dir,fake,fetcher),{code:'PLUGIN_ARTIFACT_HASH_MISMATCH'});
  assert.deepEqual(await fs.readdir(dir), []);
});

test('GitHub release pins constrain exact owner, filename, digest and redirect host', async()=>{
 const matrix=require('./integration/lavalink-plugin-matrix.json');
 const pin=matrix.youtube;
 assert.equal(jarUrl(pin).url,'https://github.com/lavalink-devs/youtube-source/releases/download/1.18.2/youtube-plugin-1.18.2.jar');
 assert.throws(()=>jarUrl({...pin,repository:'other/source'}),{code:'PLUGIN_INVALID_RELEASE_PIN'});
 assert.throws(()=>jarUrl({...pin,sha256:'0'.repeat(64)}),{code:'PLUGIN_INVALID_RELEASE_PIN'});
 await assert.rejects(verifiedJar(pin,async()=>response(null,302,{location:'https://evil.example/release.jar'})),{code:'PLUGIN_ARTIFACT_REDIRECT_REJECTED'});
 let count=0;
 await assert.rejects(verifiedJar(pin,async()=>++count===1?response(null,302,{location:'https://release-assets.githubusercontent.com/fixture'}):response(bytes)),{code:'PLUGIN_ARTIFACT_HASH_MISMATCH'});
 assert.equal(count,2);
});

test('release tag and artifact names may differ from advertised plugin name but are pinned',()=>{
 const matrix=require('./integration/lavalink-plugin-matrix.json');
 assert.equal(jarUrl(matrix.xm).url,'https://github.com/esmBot/lava-xm-plugin/releases/download/v0.2.8/lava-xm-plugin-0.2.8.jar');
 assert.equal(jarUrl(matrix['java-lyrics']).filename,'lyrics-1.6.6.jar');
 assert.throws(()=>jarUrl({...matrix.xm,tag:'v0.2.9'}),{code:'PLUGIN_INVALID_RELEASE_PIN'});
});

test('JitPack pin is restricted to audited exact coordinates',()=>{
 const p=require('./integration/lavalink-plugin-matrix.json').lavadspx;
 assert.equal(jarUrl(p).url,'https://jitpack.io/com/github/devoxin/lavadspx-plugin/0.0.5/lavadspx-plugin-0.0.5.jar');
 assert.throws(()=>jarUrl({...p,jitpack:'com/github/other/other'}),{code:'PLUGIN_INVALID_RELEASE_PIN'});
});
