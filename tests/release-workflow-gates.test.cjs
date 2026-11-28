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
  assert.ok(release.includes("'v[0-9]*.[0-9]*.[0-9]*-rc.[0-9]*'"));
  assert.ok(release.includes("'v[0-9]*.[0-9]*.[0-9]*'"));
  assert.ok(release.includes("'!v*-dev.*'"));
  assert.match(release, /release:check-tag/);
  assert.match(release, /check-npm-registry\.cjs --report-only/);
  assert.match(release, /pnpm run test:package/);
  assert.match(release, /pnpm run pack:check/);
  assert.match(release, /pnpm run test:coverage/);
  assert.match(release, /pnpm audit --prod --audit-level=high/);
});

test('immutable tags also run extended, not merely smoke, backend endurance', () => {
  assert.ok(extended.includes("'v[0-9]*.[0-9]*.[0-9]*-rc.[0-9]*'"));
  assert.ok(extended.includes("'v[0-9]*.[0-9]*.[0-9]*'"));
  assert.ok(extended.includes("'!v*-dev.*'"));
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

test('only validated archives are uploaded for manual and tag release preparation', () => {
  for (const data of [release, manual, workflow('pr.yml')]) {
    assert.match(data, /pnpm run test:package/);
    assert.match(data, /path: \.runtime\/validated-distribution\//);
    assert.match(data, /if-no-files-found: error/);
    assert.ok(data.indexOf('pnpm run test:package') < data.indexOf('path: .runtime/validated-distribution/'));
  }
});

test('release tags rerun Redis, backend protocols, expanded plugins and proposal contracts',()=>{
 for(const name of ['backend-integration.yml','redis-storage.yml','lavalink-plugin-matrix.yml','nodelink-proposals.yml']){
  const data=workflow(name);
  assert.ok(data.includes("'v[0-9]*.[0-9]*.[0-9]*-rc.[0-9]*'"),name);
  assert.ok(data.includes("'v[0-9]*.[0-9]*.[0-9]*'"),name);
  assert.ok(data.includes("'!v*-dev.*'"),name);
  assert.doesNotMatch(data,/continue-on-error:\s*true/,name);
 }
 assert.match(release,/node: \[22, 24\]/);
 assert.match(release,/generate-api-reference\.cjs --check/);
 assert.match(release,/validated-release-distribution-node-/);
});
