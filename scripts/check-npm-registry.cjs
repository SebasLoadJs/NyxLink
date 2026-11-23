'use strict';

// Public npm metadata inspection only. Does not require npm auth, mutate tags,
// create Git releases or establish whether the current operator owns a package.
const { validateReleaseManifest } = require('./release-policy.cjs');
const manifest = require('../package.json');

function inspectRegistry(manifestValue, metadata) {
  const release = validateReleaseManifest(manifestValue);
  if (!metadata || metadata.name !== 'nyxlink' ||
      !metadata.versions || typeof metadata.versions !== 'object' ||
      Array.isArray(metadata.versions) ||
      !metadata['dist-tags'] || typeof metadata['dist-tags'] !== 'object' ||
      Array.isArray(metadata['dist-tags'])) {
    throw new TypeError('Invalid public npm package metadata');
  }
  const versions = metadata.versions;
  const tags = metadata['dist-tags'];
  const versionAlreadyPublished = Object.hasOwn(versions, release.version);
  return Object.freeze({
    package: 'nyxlink',
    plannedVersion: release.version,
    plannedChannel: release.channel,
    versionAlreadyPublished,
    // Current dist-tags are informational only; never move them here.
    currentLatest: typeof tags.latest === 'string' ? tags.latest : null,
    currentNext: typeof tags.next === 'string' ? tags.next : null,
    currentDev: typeof tags.dev === 'string' ? tags.dev : null,
    // Registry existence is not an authentication/ownership check.
    registryVersionUnused: !versionAlreadyPublished,
    npmPublishPermissionVerified: false,
    publicationApproved: false,
    publicationPerformed: false,
  });
}

async function fetchRegistry(fetcher = fetch) {
  const result = await fetcher('https://registry.npmjs.org/nyxlink', {
    signal: AbortSignal.timeout(15000),
    headers: { accept: 'application/json' },
    redirect: 'error',
  });
  if (!result.ok) throw new Error('Public npm registry inspection failed (HTTP ' + result.status + ')');
  return result.json();
}

function parseArguments(args) {
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
    throw new TypeError('Invalid npm preflight arguments');
  }
  if (args.length === 0) return Object.freeze({ reportOnly: false });
  if (args.length === 1 && args[0] === '--report-only') {
    return Object.freeze({ reportOnly: true });
  }
  throw new TypeError('Usage: check-npm-registry.cjs [--report-only]');
}

async function main() {
  const { reportOnly } = parseArguments(process.argv.slice(2));
  const summary = inspectRegistry(manifest, await fetchRegistry());
  console.log(JSON.stringify({ ...summary, reportOnly }, null, 2));
  if (summary.versionAlreadyPublished && !reportOnly) {
    console.error('This package version already exists on npm and must not be republished.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(() => {
    // Registry exceptions can contain untrusted text; do not print raw errors
    // or environment variables in release logs.
    console.error('Could not verify public npm registry version availability. Nothing was published.');
    process.exitCode = 1;
  });
}

module.exports = { inspectRegistry, fetchRegistry, parseArguments };
