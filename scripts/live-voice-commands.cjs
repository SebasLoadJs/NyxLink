const { setTimeout: delay } = require('node:timers/promises');

/**
 * Bound each backend/gateway command itself, not only its subsequent REST
 * status polling. The underlying request may finish late; consumers must
 * shut down the isolated test player after a timeout.
 */
async function withDeadline(operation, label, timeoutMs = 15000) {
  if (typeof operation !== 'function' || typeof label !== 'string' || !/^[a-zA-Z0-9 -]{1,80}$/.test(label) ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
    throw new TypeError('A bounded live command needs a safe label and a timeout of 1..60000ms');
  }
  const timer = new AbortController();
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      delay(timeoutMs, undefined, { signal: timer.signal }).then(() => {
        throw new Error('Live command timed out: ' + label);
      }),
    ]);
  } finally {
    timer.abort();
  }
}

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
  if (!await withDeadline(() => player.play(), 'initial play', 30000)) throw new Error('Live backend rejected initial play');
  checks.push('playAcknowledged');
  await waitForSnapshot(node.rest, player.guildId, row => row.track?.encoded === tracks[0].encoded,
    'first track');
  checks.push('firstTrackConfirmed');

  await withDeadline(() => player.pause(), 'pause');
  await waitForSnapshot(node.rest, player.guildId, row => row.paused === true, 'pause');
  checks.push('pauseConfirmed');

  await withDeadline(() => player.resume(), 'resume');
  await waitForSnapshot(node.rest, player.guildId, row => row.paused === false, 'resume');
  checks.push('resumeConfirmed');

  await withDeadline(() => player.setVolumeAsync(40), 'volume');
  await waitForSnapshot(node.rest, player.guildId, row => row.volume === 40, 'volume');
  checks.push('volumeConfirmed');

  await withDeadline(() => player.seek(5000), 'seek');
  await waitForSnapshot(node.rest, player.guildId, row =>
    typeof row.state?.position === 'number' && row.state.position >= 4000,
    'seek');
  checks.push('seekConfirmed');

  if (!await withDeadline(() => player.skip(), 'skip')) throw new Error('Live backend rejected skip');
  checks.push('skipAcknowledged');
  await waitForSnapshot(node.rest, player.guildId, row => row.track?.encoded === tracks[1].encoded,
    'second track');
  checks.push('secondTrackConfirmed');

  await withDeadline(() => player.stop(), 'stop');
  await waitForSnapshot(node.rest, player.guildId, row => row.track === null, 'stop');
  checks.push('stopConfirmed');
  return checks;
}

module.exports = { withDeadline, waitForSnapshot, verifyCommandSequence, verifyReconnectSequence };

/**
 * Controlled Discord voice leave/rejoin while track A is active. This checks
 * SDK voice state and backend REST after a replay/restart, not audible output.
 * The script caller must have explicit authorization for the voice channel.
 */
async function verifyReconnectSequence(player, node, track) {
  if (!player || !node?.rest || typeof player.connect !== 'function' ||
    typeof player.disconnect !== 'function' || typeof player.restart !== 'function' ||
    !track || typeof track.encoded !== 'string' || !track.encoded) {
    throw new TypeError('Voice reconnect smoke requires a player, node and an encoded track');
  }
  const checks = [];
  player.queue.add([track]);
  if (!await withDeadline(() => player.play(), 'reconnect initial play', 30000)) throw new Error('Live backend rejected reconnect test playback');
  await waitForSnapshot(node.rest, player.guildId, row => row.track?.encoded === track.encoded,
    'reconnect initial track');
  checks.push('initialTrackConfirmed');

  // connect() is event-backed in NyxLink, rather than merely sending a
  // gateway packet. A voice disconnect here is intentional and authorized.
  await withDeadline(() => player.disconnect(), 'voice disconnect', 20000);
  if (player.connected) throw new Error('Player remained locally connected after disconnect');
  checks.push('disconnectConfirmed');

  await withDeadline(() => player.connect(), 'voice reconnect', 45000);
  if (!player.connected || !player.voice?.sessionId ||
    !player.voice.token || !player.voice.endpoint) {
    throw new Error('Voice credentials were not confirmed after reconnect');
  }
  checks.push('voiceReconnected');

  // Preserve the original track and explicitly exercise the recovery path.
  if (!await withDeadline(() => player.restart({ destroyOnFailure: false, startQueued: false }), 'voice restart', 45000)) {
    throw new Error('Playback restart rejected after voice reconnect');
  }
  checks.push('restartAcknowledged');

  await waitForSnapshot(node.rest, player.guildId,
    row => row.track?.encoded === track.encoded && row.state?.connected === true,
    'reconnected active track');
  checks.push('backendVoiceAndTrackConfirmed');
  return checks;
}
