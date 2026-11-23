'use strict';

const { validateReleaseTag } = require('./release-policy.cjs');
const manifest = require('../package.json');

// Deliberately requires a real GitHub tag ref. Passing a planned version is
// insufficient evidence that the immutable release tag was created correctly.
const ref = process.env.GITHUB_REF;
if (!ref) {
  console.error('GITHUB_REF is required (refs/tags/vX.Y.Z[-rc.N]); no publication performed.');
  process.exitCode = 1;
} else {
  try {
    const release = validateReleaseTag(manifest, ref);
    console.log(`Release tag policy passed: ${release.tag}, npm channel ${release.channel}. No publication performed.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
