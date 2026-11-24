const test = require('node:test');
const assert = require('node:assert/strict');
const { createContainerCommand, ensureContainerImage } = require('./helpers/container-command.cjs');
const image = `ghcr.io/example/audio@sha256:${'a'.repeat(64)}`;
const missing = () => new Error('No such image');

test('cached images require no network access', async () => {
  const calls = [];
  await ensureContainerImage(async args => calls.push(args), image);
  assert.deepEqual(calls, [['image', 'inspect', image]]);
});

test('download retries only the same digest after a transient failure', async () => {
  const calls = [], sleeps = [], warnings = [];
  await ensureContainerImage(async (args, options) => {
    calls.push({ args, options });
    if (args[0] === 'image') throw missing();
    if (calls.length === 2) throw new Error('503 Service Unavailable');
  }, image, { sleep: async ms => sleeps.push(ms), warn: message => warnings.push(message) });
  assert.deepEqual(calls.slice(1), [1, 2].map(() => ({ args: ['pull', image], options: { timeout: 180000 } })));
  assert.deepEqual(sleeps, [1000]);
  assert.equal(warnings.length, 1);
});

test('download timeouts have a finite retry budget', async () => {
  let pulls = 0;
  await assert.rejects(ensureContainerImage(async args => {
    if (args[0] === 'image') throw missing();
    pulls++;
    throw Object.assign(new Error('pull timed out'), { timedOut: true });
  }, image, { sleep: async () => {}, warn() {} }), /pull timed out/);
  assert.equal(pulls, 2);
});

test('permanent download failures and engine errors fail without retries', async () => {
  for (const message of ['unauthorized: 503 denied', 'manifest unknown', 'no matching manifest', 'no space left on device', 'x509 certificate error', 'unknown engine error']) {
    let pulls = 0;
    await assert.rejects(ensureContainerImage(async args => {
      if (args[0] === 'image') throw missing();
      pulls++;
      throw new Error(message);
    }, image), { message });
    assert.equal(pulls, 1);
  }
  let commands = 0;
  await assert.rejects(ensureContainerImage(async () => { commands++; throw new Error('permission denied'); }, image), /permission denied/);
  assert.equal(commands, 1);
});

test('missing patched local images and mutable tags are never pulled', async () => {
  for (const reference of ['nyxlink-nodelink-seek-patch:local', 'example/audio:latest']) {
    const calls = [];
    await assert.rejects(ensureContainerImage(async args => { calls.push(args); throw missing(); }, reference), /No such image/);
    assert.deepEqual(calls, [['image', 'inspect', reference]]);
  }
});

test('command failures report timeout and redact captured credentials without exposing arguments', async () => {
  const secret = 'canary-private-password';
  let invocation;
  const command = createContainerCommand('docker', [secret], async (...args) => {
    invocation = args;
    throw Object.assign(new Error(`Command failed: private-command ${secret}`), {
      killed: true, signal: 'SIGTERM', code: null,
      stdout: `output ${secret}`, stderr: `error ${secret}`,
    });
  });
  await assert.rejects(command(['run', '-e', `PASSWORD=${secret}`]), error => {
    assert.equal(error.timedOut, true);
    assert.match(error.message, /timed out after 120000ms/);
    assert.match(error.message, /\[REDACTED\]/);
    assert.doesNotMatch(error.message, /canary-private-password|private-command|PASSWORD=/);
    return true;
  });
  assert.equal(invocation[2].timeout, 120000);
  assert.equal(invocation[2].maxBuffer, 1024 * 1024);
});

test('command forwards custom pull deadline and preserves successful output', async () => {
  const output = { stdout: 'sha256:verified', stderr: '' };
  const command = createContainerCommand('podman', [], async (engine, args, options) => {
    assert.equal(engine, 'podman');
    assert.deepEqual(args, ['pull', image]);
    assert.equal(options.timeout, 180000);
    return output;
  });
  assert.equal(await command(['pull', image], { timeout: 180000 }), output);
});

test('a real child process timeout is classified without echoing its arguments', async () => {
  const command = createContainerCommand(process.execPath);
  await assert.rejects(command(['-e', 'setInterval(() => {}, 1000)'], { timeout: 100 }), error => {
    assert.equal(error.timedOut, true);
    assert.match(error.message, /timed out after 100ms/);
    assert.doesNotMatch(error.message, /setInterval/);
    return true;
  });
});

test('an output-buffer failure is not reported or retried as a deadline expiry', async () => {
  const command = createContainerCommand('docker', [], async () => {
    throw Object.assign(new Error('buffer overflow'), { killed: true, signal: 'SIGTERM', code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
  });
  await assert.rejects(command(['pull', image]), error => {
    assert.equal(error.timedOut, false);
    assert.match(error.message, /ERR_CHILD_PROCESS_STDIO_MAXBUFFER/);
    assert.doesNotMatch(error.message, /timed out/);
    return true;
  });
});
