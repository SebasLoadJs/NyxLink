const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = name => fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8');
const release = workflow('release-tag-gate.yml');
const extended = workflow('stabilization-endurance.yml');
const manual = workflow('npm-publish.yml');

test('both release tag types trigger an immutable package gate', () => {
  assert.match(release, /tags:\s*\n\s*- 'v5\.3\.0-rc\.\*'\s*\n\s*- 'v5\.3\.0'/);
  assert.match(release, /release:check-tag/);
  assert.match(release, /check-npm-registry\\.cjs --report-only/);
  assert.match(release, /pnpm run test:package/);
  assert.match(release, /pnpm run pack:check/);
  assert.match(release, /pnpm run test:coverage/);
  assert.match(release, /pnpm audit --prod --audit-level=high/);
});

test('immutable tags also run extended, not merely smoke, backend endurance', () => {
  assert.match(extended, /tags:\s*\n\s*- 'v5\.3\.0-rc\.\*'\s*\n\s*- 'v5\.3\.0'/);
  assert.match(extended, /uses: \.\/\.github\/workflows\/endurance\.yml/);
  assert.match(extended, /seconds: '600'/);
});

test('manual and tag release validation remain read-only and cannot publish packages', () => {
  for (const data of [release, manual, extended]) {
    assert.match(data, /permissions:\s*\n\s*contents: read/);
    assert.doesNotMatch(data, /^\s*(?:run:|-)\s*(?:npm|pnpm|npx)\s+publish\b/m);
    assert.doesNotMatch(data, /NODE_AUTH_TOKEN|NPM_TOKEN|id-token:\s*write/);
  }
  assert.match(manual, /workflow_dispatch:/);
  assert.match(manual, /release:check-registry/);
});

test('the published npm version and channel are validated by a separate preflight', () => {
  const registry = fs.readFileSync(path.join(root, 'scripts', 'check-npm-registry.cjs'), 'utf8');
  assert.match(registry, /validateReleaseManifest/);
  assert.match(registry, /versionAlreadyPublished/);
  assert.match(registry, /npmPublishPermissionVerified: false/);
  assert.match(registry, /publicationPerformed: false/);
});
