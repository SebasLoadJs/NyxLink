import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { capabilityTable, musicLine, startStandaloneMusicView, startCoordinatedMusicView } from './aurora-diagnostics.mjs';
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

const frames=[];let released=0;
const controller=new AbortController();
const terminal={acquire:()=>({update:line=>{frames.push(line);return true;},release:()=>{released++;}}),write(){throw Error('unexpected static write');}};
const close=startCoordinatedMusicView({snapshot:()=>({state:'playing',positionMs:500,durationMs:1000})},terminal,{signal:controller.signal});
assert.match(frames[0],/MUSIC PLAYING/);
controller.abort();close();assert.equal(released,1);
let errors=0;
startCoordinatedMusicView({snapshot(){throw Error('private');}},terminal,{onError(){errors++;}});
assert.equal(errors,1);assert.equal(released,2);
const staticLines=[];
startCoordinatedMusicView({snapshot:()=>({state:'idle'})},{acquire:()=>undefined,write:line=>staticLines.push(line)},{staticFallback:true});
assert.deepEqual(staticLines,['MUSIC IDLE N/A / N/A']);

assert.doesNotMatch(musicLine({state:'playing',positionMs:5000,durationMs:10000,stream:true}), /\[/);
