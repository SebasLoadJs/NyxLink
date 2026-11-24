const fs = require('node:fs/promises');
const path = require('node:path');

function wav(frequency, seconds = 30) {
  if (!Number.isInteger(seconds) || seconds < 15 || seconds > 120 || ![440, 660].includes(frequency)) throw new TypeError('Invalid controlled live fixture');
  const samples = seconds * 48000;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(48000, 24); data.writeUInt32LE(96000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) data.writeInt16LE(Math.round(Math.sin(index * 2 * Math.PI * frequency / 48000) * 3000), 44 + index * 2);
  return data;
}

async function createFixtures() {
  const directory = path.resolve(__dirname, '../.runtime/live-fixtures');
  await fs.mkdir(directory, { recursive: true });
  for (const [name, frequency] of [['tone-a.wav', 440], ['tone-b.wav', 660]]) await fs.writeFile(path.join(directory, name), wav(frequency));
  console.log('Created two original 30-second WAV fixtures in .runtime/live-fixtures. Make them available through your authorized HTTP(S) source before running voice tests.');
}

if (require.main === module) void createFixtures().catch(() => { console.error('Could not create live fixtures'); process.exitCode = 1; });
module.exports = { wav };
