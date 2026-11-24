import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { capabilityTable, musicLine, startStandaloneMusicView } from './aurora-diagnostics.mjs';
const table = capabilityTable([{ alias: 'NODE-01', backend: 'nodelink', ready: true, capabilities: [],
    latencyMs: 20, memoryUsedBytes: 1024 }]);
assert.match(table, /NODE-01/); assert.match(table, /20ms/); assert.match(table, /1.02 kB/);
assert.match(table, /N\/A/);
assert.match(musicLine({ state: 'playing', positionMs: 5000, durationMs: 10000 }), /\[=====-----\]/);
assert.doesNotMatch(musicLine({ state: 'playing', positionMs: 5000, stream: true }), /\[/);
const lines = [];
const stream = new Writable({write(chunk, _encoding, done) { lines.push(chunk.toString()); done(); }});
const stop = startStandaloneMusicView({snapshot: () => ({state: 'idle', stream: false})}, {stream});
stop(); assert.match(lines.join(''), /MUSIC IDLE/); assert.doesNotMatch(lines.join(''), /\x1b/);
