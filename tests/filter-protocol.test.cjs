const test = require('node:test');
const assert = require('node:assert/strict');
const {createPlayer,deferred} = require('./helpers/player.cjs');

test('built-in presets emit protocol-valid equalizer gains and unique bands', t => {
  const {player}=createPlayer(t);
  for (const name of player.filters.available) {
    player.filters.clear().enable(name);
    const payload=player.filters.toPayload();
    for (const band of payload.equalizer ?? []) assert.ok(band.gain>=-0.25 && band.gain<=1,name);
  }
  player.filters.clear().enableMultiple(['pop','bassboost-high']);
  const bands=player.filters.toPayload().equalizer;
  assert.equal(bands.length,15);
  assert.equal(bands[0].gain,0.6);
});

test('filter inputs and outgoing payloads do not share mutable objects',t=>{
  const {player}=createPlayer(t);
  const input={timescale:{pitch:1.2}};
  player.filters.define('custom',input).enable('custom');
  input.timescale.pitch=2;
  const payload=player.filters.toPayload();
  assert.equal(payload.timescale.pitch,1.2);
  payload.timescale.pitch=3;
  assert.equal(player.filters.toPayload().timescale.pitch,1.2);
  player.filters.clear().enable('nightcore');
  player.filters.toPayload().timescale.pitch=5;
  assert.equal(player.filters.toPayload().timescale.pitch,1.2);
});

test('invalid gain and nonfinite values are rejected; filter volume is not player volume',t=>{
  const {player}=createPlayer(t);
  assert.throws(()=>player.filters.setEqualizer([{band:0,gain:-0.5}]),RangeError);
  assert.throws(()=>player.filters.setEqualizer([{band:15,gain:0}]),RangeError);
  assert.throws(()=>player.filters.setSpeed(NaN));
  assert.throws(()=>player.filters.setPitch(Infinity));
  player.filters.setVolume(100);
  assert.equal(player.filters.toPayload().volume,5);
  assert.equal(player.volume,100);
  assert.throws(()=>player.filters.enable('constructor'));
});

test('presets cannot smuggle NodeLink-only filters into Lavalink',t=>{
  const {player}=createPlayer(t);
  player.filters.define('custom',{echo:{delay:100,decay:0.5}}).enable('custom');
  assert.throws(()=>player.filters.toPayload(),/NodeLink/);
});

test('filtersUpdate is emitted only after acknowledgement and does not overwrite player volume',async t=>{
  const {player,node,manager}=createPlayer(t);
  let events=0; manager.on('filtersUpdate',()=>events++);
  const pending=deferred();
  node.rest.updatePlayer=()=>pending.promise;
  const applying=player.filters.enable('nightcore').apply();
  assert.equal(events,0);
  pending.resolve({filters:{}});
  await applying;
  assert.equal(events,1);
  assert.equal(player.volume,100);
  node.rest.updatePlayer=async()=>{throw new Error('rejected');};
  await assert.rejects(player.filters.apply(),/rejected/);
  assert.equal(events,1);
});

test('bass and treble definitions preserve both sets of equalizer bands',t=>{
  const {player}=createPlayer(t);
  player.filters.define('both','bass=g=5,treble=g=5').enable('both');
  assert.equal(player.filters.toPayload().equalizer.length,12);
});
