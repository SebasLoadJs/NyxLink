const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');

const execute = promisify(execFile);

function createContainerCommand(engine, secrets = [], runner = execute) {
  const redact = value => secrets.reduce((text, secret) => secret ? text.split(secret).join('[REDACTED]') : text, String(value || ''));
  return async (args, options = {}) => {
    const timeout = options.timeout ?? 120000;
    try {
      return await runner(engine, args, { timeout, maxBuffer: 1024 * 1024 });
    } catch (error) {
      // execFile's message includes the entire command, including environment
      // credentials. Report only the operation and bounded, redacted output.
      const timedOut = Boolean(error.killed && error.signal === 'SIGTERM' && error.code === null);
      const reason = timedOut ? `timed out after ${timeout}ms` : `failed (code ${error.code ?? 'unknown'}, signal ${error.signal ?? 'none'})`;
      const failure = new Error(`${engine} ${args[0]} ${reason}\n${redact(error.stderr).slice(-8192)}\n${redact(error.stdout).slice(-8192)}`);
      failure.code = error.code;
      failure.timedOut = timedOut;
      throw failure;
    }
  };
}

async function ensureContainerImage(command, image, { sleep = delay, warn = console.warn } = {}) {
  try {
    await command(['image', 'inspect', image]);
    return;
  } catch (error) {
    // A locally built patched image must never be replaced from a registry.
    if (!/@sha256:[a-f0-9]{64}$/.test(image)) throw error;
    // Only a missing image permits a pull, not engine/permission failures.
    if (!/no such (image|object)|image not known|image .* not found/i.test(error.message)) throw error;
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await command(['pull', image], { timeout: 180000 });
      return;
    } catch (error) {
      const permanent = /unauthorized|authentication required|denied|manifest unknown|name unknown|no matching manifest|invalid reference|no space left|x509/i.test(error.message);
      const transient = error.timedOut || /TLS handshake timeout|i\/o timeout|connection reset|temporary failure|unexpected EOF|too many requests|429|502|503|504/i.test(error.message);
      if (attempt === 2 || permanent || !transient) throw error;
      warn(`Retrying pinned container download ${image} after attempt ${attempt}: ${error.message}`);
      await sleep(1000);
    }
  }
}

module.exports = { createContainerCommand, ensureContainerImage };
