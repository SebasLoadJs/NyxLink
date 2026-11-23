'use strict';

const assert = require('node:assert/strict');

const numeric = '(?:0|[1-9]\\d*)';
const releaseVersion = new RegExp(`^(${numeric}\\.${numeric}\\.${numeric})(?:-(dev|rc)\\.(${numeric}))?$`);

/**
 * Validate all publication channels before packaging; this never publishes.
 * dev -> npm dist-tag dev; rc -> next; stable -> latest.
 */
function validateReleaseManifest(manifest) {
  assert.equal(manifest.name, 'nyxlink', 'Unexpected npm package name');
  assert.equal(manifest.private, false, 'Public release requires private=false');
  assert.equal(typeof manifest.version, 'string', 'Missing package version');
  const match = releaseVersion.exec(manifest.version);
  assert.ok(match, 'Use SemVer: x.y.z, x.y.z-rc.N, or x.y.z-dev.N');
  const channel = match[2] === 'dev' ? 'dev' : match[2] === 'rc' ? 'next' : 'latest';
  assert.deepEqual(manifest.publishConfig, {
    registry: 'https://registry.npmjs.org/',
    access: 'public',
    tag: channel,
  }, `Version ${manifest.version} must publish using npm dist-tag ${channel}`);
  return Object.freeze({ version: manifest.version, channel, stable: channel === 'latest' });
}

module.exports = { validateReleaseManifest };
