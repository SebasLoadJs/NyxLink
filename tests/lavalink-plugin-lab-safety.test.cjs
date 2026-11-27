const test = require('node:test');
const assert = require('node:assert/strict');
const pins = require('./integration/backend-servers.json');
const { renderConfig, validateProfile, startupErrorCode } = require('./helpers/lavalink-plugin-lab.cjs');

const password = 'a'.repeat(48);

test('real plugin lab pins the baseline server image and both exact Maven artifacts', () => {
  assert.equal(pins.lavalinkPlugins.image, pins.lavalink.image);
  assert.deepEqual(pins.lavalinkPlugins.plugins.map(p => [p.name, p.version]), [
    ['lavalyrics-plugin', '1.1.0'],
    ['sponsorblock-plugin', '3.0.1']
  ]);
  validateProfile();
  assert.deepEqual(pins.lavalinkPlugins.plugins.map(p => p.sha256), [
    'b69db400a926685912ff78e9ff402fa343fdd9f661b16321f49f1acb0873c288',
    '9150ee91b7ba0096a52ee29f041f25bc5d25f7577ba78fc8074a10c657d68db4'
  ]);
  assert.throws(() => validateProfile({ ...pins.lavalinkPlugins, image: 'lavalink:latest' }));
  assert.throws(() => validateProfile({ ...pins.lavalinkPlugins, plugins: [{
    name: 'arbitrary', version: '0.1.0', dependency: 'com.example:x:0.1.0'
  }] }));
});

test('plugin test YAML disables runtime artifact downloads and uses isolated password', () => {
  const yaml = renderConfig(2333, password);
  assert.match(yaml, /pluginsDir: "\/opt\/Lavalink\/plugins"/);
  assert.doesNotMatch(yaml, /dependency:|repository:|snapshot:|https:\/\/maven/i);
  assert.match(yaml, /sources:\s*\[\]/);
  assert.ok(yaml.includes('password: ' + "'" + password + "'"));
  assert.match(yaml, /http: true/);
  assert.match(yaml, /youtube: false/);
  assert.doesNotMatch(yaml, /spotifyToken|discordToken|clientSecret|Authorization:/i);
  assert.throws(() => renderConfig(0, password));
  assert.throws(() => renderConfig(2333, "unsafe'password"));
  assert.throws(() => renderConfig(65536, password));
});

test('startup diagnostics return only fixed classifications, never Java error text', () => {
  const cases = [
    ['java.nio.file.AccessDeniedException: /opt/Lavalink/plugins', 'PLUGIN_DIRECTORY_PERMISSION'],
    ['Failed to download plugin because artifact was unresolved', 'PLUGIN_ARTIFACT_RESOLUTION'],
    ['java.lang.UnsupportedClassVersionError: bad class file', 'JAVA_RUNTIME_INCOMPATIBLE'],
    ['Failed to load plugin from archive', 'PLUGIN_LOAD_FAILURE'],
    ['Address already in use', 'SERVER_PORT_CONFLICT'],
    ['private-token https://private.example/secret=123', 'LAVALINK_START_FAILURE']
  ];
  for (const [message, code] of cases) {
    assert.equal(startupErrorCode(message), code);
    assert.ok(!startupErrorCode(message).includes(message));
  }
});

test('matrix isolates each verified plugin and disables credential-dependent providers',()=>{
 const {matrixProfile}=require('./helpers/lavalink-plugin-lab.cjs');
 for(const id of ['youtube','lavasrc','dunctebot']){
  const profile=matrixProfile(id);validateProfile(profile);assert.equal(profile.plugins.length,1);
  const yaml=renderConfig(2333,password,profile);
  assert.doesNotMatch(yaml,/clientSecret|refreshToken|consumerKey|dependency:|repository:/);
  assert.match(yaml,/youtube: false/);
 }
 assert.throws(()=>matrixProfile('../invalid'));
 assert.throws(()=>validateProfile({...matrixProfile('youtube'),plugins:[]}));
 assert.match(renderConfig(2333,password,matrixProfile('lavasrc')), /spotify: false/);
 assert.match(renderConfig(2333,password,matrixProfile('dunctebot')), /tumblr: false/);
});

test('XM and both Java Timed Lyrics variants use explicit independent profiles',()=>{
 const {matrixProfile,trackerModule}=require('./helpers/lavalink-plugin-lab.cjs');
 for(const id of ['xm','java-lyrics','java-lavalyrics'])validateProfile(matrixProfile(id));
 assert.equal(matrixProfile('java-lyrics').plugins.length,1);
 assert.deepEqual(matrixProfile('java-lavalyrics').plugins.map(p=>p.name),['lavalyrics-plugin','lavalyrics']);
 const module=trackerModule();assert.equal(module.length,2172);assert.equal(module.toString('ascii',1080,1084),'M.K.');assert.equal(module.readUInt16BE(42),32);
});

test('startup diagnostics distinguish linkage, dependency and native-library failures',()=>{
 for(const [message,code] of [['java.lang.NoClassDefFoundError: private','PLUGIN_CLASS_MISSING'],['java.lang.NoSuchMethodError: private','PLUGIN_BINARY_INCOMPATIBLE'],['java.lang.UnsatisfiedLinkError: private','PLUGIN_NATIVE_LIBRARY_FAILURE'],['No qualifying bean of type private','PLUGIN_REQUIRED_BEAN_MISSING'],['BeanDefinitionOverrideException: private','PLUGIN_BEAN_CONFLICT']])assert.equal(startupErrorCode(message),code);
});

test('mirror-matched release candidates become exact verified profiles only after review',()=>{
 const {matrixProfile}=require('./helpers/lavalink-plugin-lab.cjs');
 for(const id of ['lavasearch','lyrics-kt']){const p=matrixProfile(id);validateProfile(p);assert.match(p.plugins[0].sha256,/^[a-f0-9]{64}$/);}
 assert.throws(()=>matrixProfile('google-tts'));
});

test('XM local source is isolated and Spring failure classification never exposes arbitrary text',()=>{
 const {matrixProfile}=require('./helpers/lavalink-plugin-lab.cjs');
 assert.match(renderConfig(2333,password,matrixProfile('xm')), /local: true/);
 assert.match(renderConfig(2333,password,matrixProfile('java-lavalyrics')), /local: false/);
 assert.equal(startupErrorCode('No qualifying bean of type com.sedmelluq.lava.extensions.youtuberotator.planner.AbstractRoutePlanner private-data'),'PLUGIN_ROUTE_PLANNER_BEAN_MISSING');
 assert.equal(startupErrorCode('No qualifying bean of type com.github.topi314.lavalyrics.LyricsManager'),'PLUGIN_LYRICS_MANAGER_BEAN_MISSING');
});

test('only Java LavaLyrics gets an isolated loopback route planner and XM fixture is structured',()=>{
 const {matrixProfile,xmModule}=require('./helpers/lavalink-plugin-lab.cjs');
 assert.match(renderConfig(2333,password,matrixProfile('java-lavalyrics')), /ipBlocks: \["127\.0\.0\.0\/30"\]/);
 assert.doesNotMatch(renderConfig(2333,password,matrixProfile('java-lyrics')), /ratelimit:/);
 const xm=xmModule();assert.equal(xm.toString('ascii',0,17),'Extended Module: ');assert.equal(xm.readUInt16LE(58),0x104);assert.equal(xm.readUInt16LE(70),1);
});
