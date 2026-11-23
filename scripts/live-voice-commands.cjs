const { setTimeout: delay } = require('node:timers/promises');

/**
 * Live backend command acceptance. Does not infer that listeners heard audio:
 * only acknowledged REST state and queue movement are measured.
 */
async function waitForSnapshot(rest, guildId, matches, label, timeoutMs = 4000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const snapshot = await rest.getPlayer(guildId);
    if (snapshot && matches(snapshot)) return;
    await delay(100);
  }
  throw new Error('Live backend did not confirm ' + label);
}

async function verifyCommandSequence(player, node, tracks) {
  if (!player || !node?.rest || !Array.isArray(tracks) || tracks.length !== 2) {
    throw new TypeError('Command smoke requires a player, node and exactly two controlled tracks');
  }
  const checks = [];
  player.queue.add(tracks);
  if (!await player.play()) throw new Error('Live backend rejected initial play');
  checks.push('playAcknowledged');

  await player.pause();
  await waitForSnapshot(node.rest, player.guildId, row => row.paused === true, 'pause');
  checks.push('pauseConfirmed');

  await player.resume();
  await waitForSnapshot(node.rest, player.guildId, row => row.paused === false, 'resume');
  checks.push('resumeConfirmed');

  player.setVolume(40);
  await waitForSnapshot(node.rest, player.guildId, row => row.volume === 40, 'volume');
  checks.push('volumeConfirmed');

  await player.seek(5000);
  await waitForSnapshot(node.rest, player.guildId, row =>
    typeof row.state?.position === 'number' && row.state.position >= 4000,
    'seek');
  checks.push('seekConfirmed');

  if (!await player.skip()) throw new Error('Live backend rejected skip');
  checks.push('skipAcknowledged');
  return checks;
}

module.exports = { waitForSnapshot, verifyCommandSequence };
