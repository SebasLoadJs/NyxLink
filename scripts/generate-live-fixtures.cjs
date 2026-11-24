const fs = require('node:fs/promises');
const path = require('node:path');
const RATE = 48000;

// Original synthetic audio, not a downloaded recording. The different pitches
// and short amplitude pulses make both fixtures distinguishable during overlap.
function generateWave({ seconds = 60, frequency, pulseHz }) {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 120) throw new RangeError('seconds must be an integer from 1 to 120');
  if (!Number.isFinite(frequency) || frequency < 100 || frequency > 2000) throw new RangeError('frequency must be 100..2000 Hz');
  if (!Number.isFinite(pulseHz) || pulseHz < 0.5 || pulseHz > 4) throw new RangeError('pulseHz must be 0.5..4 Hz');
  const samples = seconds * RATE;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / RATE;
    // Smooth edges avoid fixture-generated pops. Amplitude stays below 12% FS.
    const edge = Math.min(1, i / 480, (samples - 1 - i) / 480);
    const envelope = 0.65 + 0.35 * Math.cos(2 * Math.PI * pulseHz * t);
    const value = Math.round(3800 * edge * envelope * Math.sin(2 * Math.PI * frequency * t));
    data.writeInt16LE(value, 44 + 2 * i);
  }
  return data;
}

async function main() {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/generate-live-fixtures.cjs');
  const directory = path.resolve(__dirname, '../.runtime/live-fixtures');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'track-a.wav'), generateWave({ frequency: 440, pulseHz: 1 }));
  await fs.writeFile(path.join(directory, 'track-b.wav'), generateWave({ frequency: 660, pulseHz: 2 }));
  console.log('Generated original 60-second WAV fixtures in ' + directory);
  console.log('Host them on an authorized HTTP(S) origin reachable by your audio server. No server was started.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { generateWave };
