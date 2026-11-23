const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectRegistry, fetchRegistry, parseArguments, isPublicationBlocked } = require('../scripts/check-npm-registry.cjs');

const fixture = (version, channel) => ({
  name: 'nyxlink',
  version,
  private: false,
  publishConfig: { registry: 'https://registry.npmjs.org/', access: 'public', tag: channel },
});
const registry = {
  name: 'nyxlink',
  versions: {
    '0.1.0-dev.1': { name: 'nyxlink', version: '0.1.0-dev.1' },
    '0.1.0-dev.2': { name: 'nyxlink', version: '0.1.0-dev.2' },
  },
  'dist-tags': { latest: '0.1.0-dev.1', dev: '0.1.0-dev.2' },
};

test('registry preflight accepts unused RC version but never grants publication permission', () => {
  const status = inspectRegistry(fixture('5.3.0-rc.1', 'next'), registry);
  assert.deepEqual(status, {
    package: 'nyxlink',
    plannedVersion: '5.3.0-rc.1',
    plannedChannel: 'next',
    versionAlreadyPublished: false,
    currentLatest: '0.1.0-dev.1',
    currentNext: null,
    currentDev: '0.1.0-dev.2',
    registryVersionUnused: true,
    npmPublishPermissionVerified: false,
    publicationApproved: false,
    publicationPerformed: false,
  });
});

test('registry preflight detects immutable version collisions', () => {
  const status = inspectRegistry(fixture('0.1.0-dev.2', 'dev'), registry);
  assert.equal(status.versionAlreadyPublished, true);
  assert.equal(status.registryVersionUnused, false);
  assert.equal(status.publicationApproved, false);
});

test('release preflight refuses mismatched manifest channel or invalid metadata', () => {
  assert.throws(() => inspectRegistry(fixture('5.3.0-rc.1', 'latest'), registry), /dist-tag/);
  assert.throws(() => inspectRegistry(fixture('5.3.0', 'latest'), { ...registry, name: 'other' }), /metadata/);
  assert.throws(() => inspectRegistry(fixture('5.3.0', 'latest'), { ...registry, versions: null }), /metadata/);
});

test('fetchRegistry only reads the fixed public npm registry endpoint', async () => {
  let calls = 0;
  const fake = async (url, options) => {
    calls++;
    assert.equal(url, 'https://registry.npmjs.org/nyxlink');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.accept, 'application/json');
    assert.equal(typeof options.signal?.aborted, 'boolean');
    return { ok: true, json: async () => registry };
  };
  assert.equal(await fetchRegistry(fake), registry);
  assert.equal(calls, 1);
});

test('fetchRegistry rejects non-successful responses instead of assuming availability', async () => {
  await assert.rejects(fetchRegistry(async () => ({ ok: false, status: 500 })), /HTTP 500/);
});

test('tag reruns use an explicit informational mode, while prepublish remains blocking', () => {
  assert.deepEqual(parseArguments([]), { reportOnly: false });
  assert.deepEqual(parseArguments(['--report-only']), { reportOnly: true });
  assert.throws(() => parseArguments(['--report-only', '--unknown']), /Usage/);
  assert.throws(() => parseArguments(['--write']), /Usage/);
  assert.throws(() => parseArguments(null), TypeError);
  const occupied = inspectRegistry(fixture('0.1.0-dev.2', 'dev'), registry);
  assert.equal(occupied.versionAlreadyPublished, true);
  assert.equal(occupied.publicationApproved, false);
});

test('a published version blocks prepublish but never fails an informational tag rerun', () => {
  const occupied = inspectRegistry(fixture('0.1.0-dev.2', 'dev'), registry);
  const unused = inspectRegistry(fixture('5.3.0-rc.1', 'next'), registry);
  assert.equal(isPublicationBlocked(occupied, parseArguments([])), true);
  assert.equal(isPublicationBlocked(occupied, parseArguments(['--report-only'])), false);
  assert.equal(isPublicationBlocked(unused, parseArguments([])), false);
  assert.equal(isPublicationBlocked(unused, parseArguments(['--report-only'])), false);
  assert.throws(() => isPublicationBlocked({}, { reportOnly: true }), TypeError);
});
