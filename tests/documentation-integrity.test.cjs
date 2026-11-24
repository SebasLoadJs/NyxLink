const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('public README preserves banner, complete Aurora entry points and valid documentation links', () => {
 const readme = fs.readFileSync(path.join(root,'README.md'),'utf8');
 const manifest = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.match(readme,/assets\/nyxlink_banner\.png/);
 assert.ok(fs.existsSync(path.join(root,'assets/nyxlink_banner.png')));
 assert.ok(fs.existsSync(path.join(root,'assets/nyxlink-wave.svg')));
 for (const match of readme.matchAll(/\]\(([^)#\s]+)\)/g)) {
  if (!/^https?:\/\//.test(match[1])) assert.ok(fs.existsSync(path.resolve(root,match[1])), match[1]);
 }
 for (const entry of Object.keys(manifest.exports).filter(key => key.startsWith('./aurora'))) {
  assert.ok(readme.includes('nyxlink'+entry.slice(1)),entry);
 }
 assert.doesNotMatch(readme,/logging:\s*\{[^}]*banner:\s*true/);
});
