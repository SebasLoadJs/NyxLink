const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReleaseManifest } = require('../scripts/release-policy.cjs');
const current = require('../package.json');

const manifest = (version, tag) => ({
  name: 'nyxlink', version, private: false,
  publishConfig: { registry: 'https://registry.npmjs.org/', access: 'public', tag },
});

test('current development package remains valid without promoting it', () => {
  const result = validateReleaseManifest(current);
  assert.equal(result.channel, 'dev');
  assert.equal(result.stable, false);
});

test('release candidate must use the npm next channel', () => {
  assert.deepEqual(validateReleaseManifest(manifest('5.3.0-rc.1', 'next')), {
    version: '5.3.0-rc.1', channel: 'next', stable: false,
  });
});

test('stable 5.3.0 must publish on the npm latest channel', () => {
  assert.deepEqual(validateReleaseManifest(manifest('5.3.0', 'latest')), {
    version: '5.3.0', channel: 'latest', stable: true,
  });
});

test('rejects mismatched version/channel combinations and unsafe manifests', () => {
  for (const [version, channel] of [
    ['5.3.0', 'dev'],
    ['5.3.0-rc.1', 'latest'],
    ['0.1.0-dev.3', 'latest'],
  ]) {
    assert.throws(() => validateReleaseManifest(manifest(version, channel)), /dist-tag/);
  }
  for (const version of ['v5.3', '5.3', '5.3.0-beta.1', '5.3.0-rc.01', '05.3.0', '5.3.0+unapproved']) {
    assert.throws(() => validateReleaseManifest(manifest(version, 'latest')), /SemVer/);
  }
  assert.throws(() => validateReleaseManifest({ ...manifest('5.3.0', 'latest'), private: true }), /private=false/);
  assert.throws(() => validateReleaseManifest({ ...manifest('5.3.0', 'latest'), name: 'unexpected' }), /package name/);
  assert.throws(() => validateReleaseManifest({
    ...manifest('5.3.0', 'latest'),
    publishConfig: { ...manifest('5.3.0', 'latest').publishConfig, registry: 'https://registry.example.invalid/' },
  }), /dist-tag/);
});
