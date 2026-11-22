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
  assert.throws(() => validateProfile({ ...pins.lavalinkPlugins, image: 'lavalink:latest' }));
  assert.throws(() => validateProfile({ ...pins.lavalinkPlugins, plugins: [{
    name: 'arbitrary', version: '0.1.0', dependency: 'com.example:x:0.1.0'
  }] }));
});

test('plugin test YAML uses fixed repositories and only an isolated password', () => {
  const yaml = renderConfig(2333, password);
  assert.match(yaml, /com\.github\.topi314\.lavalyrics:lavalyrics-plugin:1\.1\.0/);
  assert.match(yaml, /com\.github\.topi314\.sponsorblock:sponsorblock-plugin:3\.0\.1/);
  assert.equal((yaml.match(/repository: "https:\/\/maven\.lavalink\.dev\/releases"/g) || []).length, 2);
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
