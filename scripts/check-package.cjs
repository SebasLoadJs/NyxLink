const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
// Git blob identity of the complete upstream OSL-3.0 license reviewed on 2026-11-24.
const license = readFileSync(resolve(root, 'LICENSE'));
const identity = createHash('sha1').update('blob ' + license.length + '\0').update(license).digest('hex');
assert.equal(identity, 'cee9c3cff349671ef36ff601176679e452f3e5a5', 'Upstream license bytes changed; require attribution review');
const notice = readFileSync(resolve(root, 'NOTICE.md'), 'utf8');
assert.match(notice, /Moonlink\.js/);
assert.match(notice, /Ecliptia\/moonlink\.js/);
assert.match(notice, /Open Software License \(OSL\) version 3\.0/);

const { packDistribution, assertDistributionFile } = require('./pack-distribution.cjs');
const archive = packDistribution(undefined, { dryRun: true });
const files = archive.files.map(file => file.path);
for (const required of ['package.json', 'README.md', 'LICENSE', 'NOTICE.md', 'dist/index.js', 'dist/index.d.ts', 'assets/nyxlink_banner.png', 'examples/aurora-pipeline.mjs', 'examples/aurora-pipeline.d.mts', 'examples/aurora-inspector.mjs', 'examples/aurora-sdk.cjs']) {
  assert.ok(files.includes(required), `Package missing ${required}`);
}
for (const file of files) assertDistributionFile(file);
console.log(`Package verified: ${files.length} files, ${archive.size} bytes; no publication performed.`);
