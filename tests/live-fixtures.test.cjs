const test = require('node:test');
const assert = require('node:assert/strict');
const { generateWave } = require('../scripts/generate-live-fixtures.cjs');

test('live fixtures use mono 48kHz PCM16 WAV with the exact requested duration', () => {
  const data = generateWave({ seconds: 1, frequency: 440, pulseHz: 1 });
  assert.equal(data.length, 44 + 48000 * 2);
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(data.readUInt32LE(4), data.length - 8);
  assert.equal(data.readUInt16LE(20), 1);
  assert.equal(data.readUInt16LE(22), 1);
  assert.equal(data.readUInt32LE(24), 48000);
  assert.equal(data.readUInt16LE(34), 16);
  assert.equal(data.toString('ascii', 36, 40), 'data');
  assert.equal(data.readUInt32LE(40), 96000);
  assert.equal(data.readInt16LE(44), 0);
  assert.equal(data.readInt16LE(data.length - 2), 0);
});

test('two controlled fixtures are deterministic, distinct and bounded in amplitude', () => {
  const options = { seconds: 1, frequency: 440, pulseHz: 1 };
  const a = generateWave(options);
  const b = generateWave({ seconds: 1, frequency: 660, pulseHz: 2 });
  assert.deepEqual(a, generateWave(options));
  assert.notDeepEqual(a, b);
  for (const wave of [a, b]) {
    let peak = 0;
    for (let i = 44; i < wave.length; i += 2) peak = Math.max(peak, Math.abs(wave.readInt16LE(i)));
    assert.ok(peak > 1000 && peak <= 3800);
  }
});

test('fixture generator rejects invalid duration, pitch and pulse before allocating audio', () => {
  const valid = { seconds: 1, frequency: 440, pulseHz: 1 };
  for (const invalid of [{seconds: 0}, {seconds: 121}, {seconds: 1.5}, {frequency: NaN}, {frequency: 5000}, {pulseHz: 0}, {pulseHz: Infinity}]) {
    assert.throws(() => generateWave({ ...valid, ...invalid }), RangeError);
  }
});
