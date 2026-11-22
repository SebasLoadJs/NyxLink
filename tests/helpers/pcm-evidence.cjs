'use strict';

const assert = require('node:assert/strict');

// The NodeLink /v4/loadstream wire contract is stereo S16LE PCM at 48 kHz.
// Evidence is computed from the response bytes, not from REST acknowledgements.
const PCM_SAMPLE_RATE = 48000;
const PCM_CHANNELS = 2;
const PCM_BITS = 16;
const PCM_BYTES_PER_SECOND = PCM_SAMPLE_RATE * PCM_CHANNELS * (PCM_BITS / 8);
const WAV_HEADER_BYTES = 44;

async function readBounded(stream, maxBytes = 1024 * 1024) {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new TypeError('Stream must be asynchronously iterable');
  }
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      total += chunk.length;
      if (total > maxBytes) throw new RangeError('Decoded audio exceeded local fixture budget');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, total);
  } finally {
    stream.destroy?.();
  }
}

function parseWavPcm(audio) {
  assert.ok(Buffer.isBuffer(audio) && audio.length >= WAV_HEADER_BYTES, 'Expected RIFF/WAVE header');
  assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
  assert.equal(audio.toString('ascii', 8, 12), 'WAVE');
  assert.equal(audio.toString('ascii', 12, 16), 'fmt ');
  assert.equal(audio.readUInt16LE(20), 1, 'Uncompressed PCM format');
  assert.equal(audio.readUInt16LE(22), PCM_CHANNELS, 'Stereo output');
  assert.equal(audio.readUInt32LE(24), PCM_SAMPLE_RATE, '48 kHz output');
  assert.equal(audio.readUInt32LE(28), PCM_BYTES_PER_SECOND, 'PCM byte rate');
  assert.equal(audio.readUInt16LE(32), PCM_CHANNELS * PCM_BITS / 8, 'Frame alignment');
  assert.equal(audio.readUInt16LE(34), PCM_BITS, '16-bit output');
  assert.equal(audio.toString('ascii', 36, 40), 'data');
  assert.equal((audio.length - WAV_HEADER_BYTES) % 4, 0, 'Complete stereo frames');
  return audio.subarray(WAV_HEADER_BYTES);
}

function audioEvidence(pcm) {
  assert.ok(Buffer.isBuffer(pcm) && pcm.length % 2 === 0, 'Expected 16-bit signed PCM');
  let squares = 0;
  let nonZero = 0;
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    const sample = pcm.readInt16LE(i);
    squares += sample * sample;
    if (sample !== 0) nonZero++;
    peak = Math.max(peak, Math.abs(sample));
  }
  const sampleCount = pcm.length / 2;
  return {
    bytes: pcm.length,
    durationMs: pcm.length / PCM_BYTES_PER_SECOND * 1000,
    rms: sampleCount ? Math.sqrt(squares / sampleCount) : 0,
    nonZero,
    peak,
  };
}

async function streamAudio(rest, encodedTrack, controls = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  timeout.unref?.();
  try {
    const response = await rest.loadStream(
      { encodedTrack, format: 'wav', volume: 100, position: 0, ...controls },
      { signal: controller.signal, timeoutMs: 30000 }
    );
    const data = await readBounded(response.stream);
    const pcm = controls.format === 'raw' || controls.format === 'pcm' ? data : parseWavPcm(data);
    return { data, pcm, evidence: audioEvidence(pcm), headers: response.headers };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  PCM_BYTES_PER_SECOND, WAV_HEADER_BYTES,
  readBounded, parseWavPcm, audioEvidence, streamAudio,
};
