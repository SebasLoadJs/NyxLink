const { setTimeout: delay } = require('node:timers/promises');

/**
 * Live backend command acceptance. Does not infer that listeners heard audio:
 * only acknowledged REST state and queue movement are measured.
 */
async function waitForSnapshot(rest, guildId, matches, label, timeoutMs = 4000) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
    throw new TypeError('Snapshot polling timeout must be 1..60000 milliseconds');
  }
  const errorMessage = 'Live backend did not confirm ' + label;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const timer = new AbortController();
    try {
      // A stalled HTTP status request must not hang a live-voice acceptance run.
      const snapshot = await Promise.race([
        Promise.resolve().then(() => rest.getPlayer(guildId)),
        delay(remaining, undefined, { signal: timer.signal }).then(() => {
          throw new Error(errorMessage);
        }),
      ]);
      if (snapshot && matches(snapshot)) return;
    } finally {
      timer.abort();
    }
    const pause = Math.min(100, Math.max(0, deadline - Date.now()));
    if (pause) await delay(pause);
  }
  throw new Error(errorMessage);
}

async function verifyCommandSequence(player, node, tracks) {
  if (!player || !node?.rest || !Array.isArray(tracks) || tracks.length !== 2) {
    throw new TypeError('Command smoke requires a player, node and exactly two controlled tracks');
  }
  const checks = [];
  player.queue.add(tracks);
  if (!await player.play()) throw new Error('Live backend rejected initial play');
  checks.push('playAcknowledged');
  await waitForSnapshot(node.rest, player.guildId, row => row.track?.encoded === tracks[0].encoded,
    'first track');
  checks.push('firstTrackConfirmed');

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
  await waitForSnapshot(node.rest, player.guildId, row => row.track?.encoded === tracks[1].encoded,
    'second track');
  checks.push('secondTrackConfirmed');
  return checks;
}

module.exports = { waitForSnapshot, verifyCommandSequence };
