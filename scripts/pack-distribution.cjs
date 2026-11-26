'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { packageManagerCommand } = require('./package-manager-command.cjs');
const root = path.resolve(__dirname, '..');
const approved = /^(dist\/|assets\/nyxlink_banner\.png$|assets\/(?:nyxlink-(?:wave|architecture|aurora|git-log|verification)\.svg|readme\/nyx-(?:hello|think|ready|media)\.svg)$|package\.json$|README\.md$|LICENSE$|NOTICE\.md$|examples\/aurora-(?:pipeline|visual|terminal-tools|bootstrap|diagnostics|inspector|otel|demo|file)\.(?:mjs|d\.mts)$|examples\/aurora-sdk\.(?:cjs|d\.cts)$)/;
const forbidden = /(^|\/)(?:tests?|scripts?|\.env[^/]*|node_modules|\.runtime|datastore|\.moonlink)(?:\/|$)|\.(?:log|tgz)$/i;
function assertDistributionFile(file) {
  assert.ok(approved.test(file), 'Unexpected package file: ' + file);
  assert.ok(!forbidden.test(file), 'Development or private file in package: ' + file);
}
function npm(args, cwd) {
  const invocation = packageManagerCommand('npm', args);
  const result = spawnSync(invocation.command, invocation.args, { cwd, encoding:'utf8', timeout:120000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
  return JSON.parse(result.stdout)[0];
}
function packDistribution(destination, { dryRun = false } = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'nyxlink-distribution-'));
  try {
    const inventory = npm(['pack','--dry-run','--json','--ignore-scripts'],root);
    for (const {path: file} of inventory.files) {
      assertDistributionFile(file);
      const target = path.join(temporary, file);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(path.join(root,file),target);
    }
    const manifestPath = path.join(temporary,'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    for (const field of ['scripts','devDependencies','packageManager','pnpm']) delete manifest[field];
    fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    const args=['pack','--json','--ignore-scripts',...(dryRun?['--dry-run']:['--pack-destination',path.resolve(destination)])];
    const archive=npm(args,temporary);
    for (const {path: file} of archive.files) assertDistributionFile(file);
    return archive;
  } finally {
    fs.rmSync(temporary,{recursive:true,force:true});
  }
}
module.exports={packDistribution,assertDistributionFile};
if(require.main===module) {
  const destination=path.resolve(process.argv[2]||'.runtime/distribution');
  fs.mkdirSync(destination,{recursive:true});
  const archive=packDistribution(destination);
  console.log(path.join(destination,archive.filename));
}
