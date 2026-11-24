const fs = require('node:fs');
const path = require('node:path');

// Windows .cmd shims cannot be passed directly to spawnSync. Run the
// installed JavaScript CLI with Node, preserving argument boundaries and
// avoiding a shell for paths containing spaces or command metacharacters.
function packageManagerCommand(name, args) {
  if (!['npm', 'pnpm'].includes(name)) throw new TypeError('Unsupported package manager');
  if (process.platform !== 'win32') return { command: name, args };
  const cliNames = name === 'npm' ? ['npm-cli.js'] : ['pnpm.cjs', 'pnpm.mjs'];
  const active = process.env.npm_execpath;
  if (active && cliNames.includes(path.basename(active)) && fs.existsSync(active)) {
    return { command: process.execPath, args: [active, ...args] };
  }
  const directories = [path.dirname(process.execPath), path.resolve(path.dirname(process.execPath), '..'),
    ...(active ? [path.resolve(path.dirname(active), '../../..')] : []), ...(process.env.PATH || '').split(path.delimiter)];
  for (const directory of directories) {
    if (!directory) continue;
    const base = directory.replace(/^"|"$/g, '');
    for (const cli of cliNames) {
      const candidate = path.join(base, 'node_modules', name, 'bin', cli);
      if (fs.existsSync(candidate)) return { command: process.execPath, args: [candidate, ...args] };
    }
    const executable = path.join(base, name + '.exe');
    if (fs.existsSync(executable)) return { command: executable, args };
    const shim = path.join(base, name + '.cmd');
    if (fs.existsSync(shim)) {
      // Read only a quoted %~dp0/%dp0% reference to this manager's known CLI.
      // Never execute or interpret the batch program itself.
      const source = fs.readFileSync(shim, 'utf8').slice(0, 8192);
      for (const match of source.matchAll(/"%(?:~dp0|dp0%)([^"\r\n]+)"/g)) {
        const candidate = path.resolve(base, match[1].replace(/^[\\/]+/, ''));
        if (cliNames.includes(path.basename(candidate)) && path.basename(path.dirname(candidate)) === 'bin' &&
            path.basename(path.dirname(path.dirname(candidate))) === name && fs.existsSync(candidate)) {
          return { command: process.execPath, args: [candidate, ...args] };
        }
      }
    }
  }
  throw new Error(`Cannot locate ${name}'s JavaScript CLI; run this check with ${name} installed on PATH.`);
}

module.exports = { packageManagerCommand };
