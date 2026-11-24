const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { TerminalCoordinator } = require('../dist');
class Stream extends EventEmitter {
    constructor() { super(); this.output = []; this.isTTY = true; this.columns = 40; this.accept = true; }
    write(text) { this.output.push(text); return this.accept; }
    drain() { this.accept = true; this.emit('drain'); }
}
function interactive(fn) {
    const saved = Object.fromEntries(['CI','NO_COLOR','TERM'].map(key => [key, process.env[key]]));
    delete process.env.CI; delete process.env.NO_COLOR; process.env.TERM = 'xterm';
    return Promise.resolve().then(fn).finally(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
}
test('exclusive region clears, logs and restores without duplicate redraw', () => interactive(async () => {
    const stream = new Stream();
    const terminal = new TerminalCoordinator({ stream, interactive: true });
    const lease = terminal.acquire();
    assert.ok(lease);
    assert.equal(terminal.acquire(), undefined);
    lease.update('connecting');
    lease.update('connecting');
    assert.deepEqual(stream.output, ['\r\x1b[2Kconnecting']);
    terminal.write('event');
    assert.deepEqual(stream.output.slice(1), ['\r\x1b[2Kevent\n', '\r\x1b[2Kconnecting']);
    lease.release(); lease.release();
    assert.equal(lease.update('stale'), false);
    assert.equal(await terminal.close(), true);
    assert.equal(stream.output.at(-1), '\r\x1b[2K');
    assert.equal(stream.listenerCount('drain'), 0);
}));
test('blocked stream coalesces region changes and does not redraw on drain forever', () => interactive(async () => {
    const stream = new Stream(); stream.accept = false;
    const terminal = new TerminalCoordinator({ stream, interactive: true });
    const lease = terminal.acquire();
    lease.update('first'); lease.update('latest');
    assert.equal(stream.output.length, 1);
    stream.drain();
    assert.equal(stream.output.at(-1), '\r\x1b[2Klatest');
    stream.emit('drain');
    assert.equal(stream.output.length, 2);
    lease.update('x'.repeat(100));
    assert.equal(stream.output.at(-1).slice(5).length, 39);
    await terminal.close();
}));
test('bounded queue evicts normal records for critical events and exposes all rejects', async () => {
    const stream = new Stream(); stream.accept = false;
    const rejected = [];
    const terminal = new TerminalCoordinator({ stream, maxQueued: 2, onRejected: (...args) => rejected.push(args) });
    assert.equal(terminal.write('accepted by stream'), true);
    terminal.write('normal 1'); terminal.write('normal 2');
    assert.equal(terminal.write('critical 1', 'critical'), true);
    assert.equal(terminal.write('critical 2', 'critical'), true);
    assert.equal(terminal.write('critical 3', 'critical'), false);
    assert.equal(terminal.stats.queued, 2);
    assert.equal(terminal.stats.evicted, 2);
    assert.deepEqual(rejected, [['capacity','normal'],['capacity','normal'],['capacity','critical']]);
    const drained = terminal.flush();
    stream.drain();
    assert.equal(await drained, true);
    assert.deepEqual(stream.output, ['accepted by stream\n','critical 1\n','critical 2\n']);
    assert.equal(await terminal.close(), true);
});
test('non-TTY and NO_COLOR disable interactive regions and strip injected controls', () => interactive(async () => {
    const stream = new Stream(); stream.isTTY = false;
    const terminal = new TerminalCoordinator({ stream, interactive: true });
    assert.equal(terminal.acquire(), undefined);
    terminal.write('\x1b[31mtest\x1b[0m\x07');
    assert.equal(stream.output[0], 'test\n');
    await terminal.close();
    process.env.NO_COLOR = '';
    const second = new TerminalCoordinator({ stream: new Stream(), interactive: true });
    assert.equal(second.acquire(), undefined);
    await second.close();
}));
test('abort bounds shutdown and reports discarded records without ending host stream', async () => {
    const stream = new Stream(); stream.accept = false;
    const terminal = new TerminalCoordinator({ stream });
    terminal.write('in flight'); terminal.write('queued', 'critical');
    const controller = new AbortController();
    const closing = terminal.close(controller.signal);
    controller.abort();
    assert.equal(await closing, false);
    assert.equal(terminal.stats.rejected, 1);
    assert.equal(stream.listenerCount('error'), 0);
    assert.equal(terminal.write('late'), false);
});
test('stream failures isolate exceptions and reject pending records', async () => {
    const stream = new Stream(); stream.accept = false;
    const terminal = new TerminalCoordinator({ stream });
    terminal.write('in flight'); terminal.write('queued');
    const flushed = terminal.flush();
    stream.emit('error', Error('broken'));
    assert.equal(await flushed, false);
    assert.equal(terminal.stats.streamErrors, 1);
    assert.equal(terminal.stats.rejected, 1);
    assert.equal(await terminal.close(), false);
});

test('one stream owner, automatic resize, and shared close result', () => interactive(async () => {
    const stream = new Stream();
    const terminal = new TerminalCoordinator({ stream, interactive: true });
    assert.throws(() => new TerminalCoordinator({ stream }), /already owned/);
    const lease = terminal.acquire();
    lease.update('abcdefghijklmnopqrstuvwxyz0123456789');
    stream.columns = 12;
    stream.emit('resize');
    assert.equal(stream.output.at(-1), '\r\x1b[2Kabcdefghijk');
    stream.columns = 40;
    stream.emit('resize');
    assert.match(stream.output.at(-1), /0123456789$/);
    const first = terminal.close();
    assert.equal(terminal.close(), first);
    assert.equal(await first, true);
    assert.equal(stream.listenerCount('resize'), 0);
    const next = new TerminalCoordinator({stream});
    await next.close();
}));
test('critical overflow reaches independent fallback; reentrant rejection cannot grow queue', async () => {
    const stream = new Stream(); stream.accept = false;
    const fallback = [];
    let terminal;
    terminal = new TerminalCoordinator({stream, maxQueued: 1,
        onRejected() { terminal.write('recursive normal'); },
        onCriticalRejected(reason,text) { fallback.push([reason,text]); }
    });
    terminal.write('in flight');
    terminal.write('queued critical','critical');
    assert.equal(terminal.write('\x1b[31moverflow\x1b[0m','critical'),false);
    assert.equal(terminal.stats.queued,1);
    assert.deepEqual(fallback,[['capacity','overflow']]);
    const abort = new AbortController();
    abort.abort();
    assert.equal(await terminal.close(abort.signal), false);
    assert.deepEqual(fallback,[['capacity','overflow'],['closed','queued critical\n']]);
    assert.equal(await terminal.close(),false);
});
