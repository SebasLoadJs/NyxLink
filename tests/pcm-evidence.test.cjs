const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const {
  PCM_BYTES_PER_SECOND, WAV_HEADER_BYTES,
  readBounded, parseWavPcm, audioEvidence, streamAudio,
} = require('./helpers/pcm-evidence.cjs');

function sampleWav(samples) {
  const audio = Buffer.alloc(WAV_HEADER_BYTES + samples.length * 2);
  audio.write('RIFF', 0);
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(2, 22);
  audio.writeUInt32LE(48000, 24);
  audio.writeUInt32LE(192000, 28);
  audio.writeUInt16LE(4, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('data', 36);
  audio.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => audio.writeInt16LE(sample, 44 + index * 2));
  return audio;
}

test('WAV evidence validates real PCM frame layout and measures normalized signal energy', () => {
  const pcm = parseWavPcm(sampleWav([0, 1000, -1000, 0]));
  const evidence = audioEvidence(pcm);
  assert.equal(evidence.bytes, 8);
  assert.equal(evidence.nonZero, 2);
  assert.equal(evidence.peak, 1000);
  assert.ok(Math.abs(evidence.rms - Math.sqrt(500000)) < 0.01);
  assert.equal(evidence.durationMs, 8 / PCM_BYTES_PER_SECOND * 1000);
});

test('WAV evidence rejects false bit depth and incomplete stereo frames', () => {
  const malformed = sampleWav([0, 1, -1, 0]);
  malformed.writeUInt16LE(8, 34);
  assert.throws(() => parseWavPcm(malformed), /16-bit/);
  assert.throws(() => parseWavPcm(sampleWav([1, 2, 3])), /Complete stereo frames/);
});

test('bounded PCM collection rejects oversized bodies and destroys their source', async () => {
  const stream = Readable.from([Buffer.alloc(6), Buffer.alloc(8)]);
  await assert.rejects(readBounded(stream, 10), /budget/);
  assert.equal(stream.destroyed, true);
});

test('raw PCM alias is measured without a WAV header', async () => {
  const pcm = Buffer.from([0, 0, 100, 0, 0, 0, 100, 0]);
  const calls = [];
  const rest = { loadStream: async (payload, options) => {
    calls.push([payload, options]);
    return { stream: Readable.from([pcm]), headers: { 'content-type': 'audio/l16' } };
  }};
  const evidence = await streamAudio(rest, 'fixture', { format: 'raw', volume: 25 });
  assert.equal(evidence.evidence.nonZero, 2);
  assert.equal(evidence.evidence.peak, 100);
  assert.equal(evidence.pcm.length, pcm.length);
  assert.equal(calls[0][0].format, 'raw');
  assert.equal(calls[0][0].volume, 25);
  assert.ok(calls[0][1].signal);
});
