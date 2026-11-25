const test = require('node:test');
const assert = require('node:assert/strict');
const { Filters, BackendDetector } = require('../dist');
const { projectAdvancedAudio, suspendNativeFilters } = require('../dist/src/players/AdvancedAudioRecovery');

const node = (isNodeLink, capabilities = []) => ({
    isNodeLink, backend: BackendDetector.detect({ version: { semver: '4.2.2' }, isNodelink: isNodeLink }, {}, new Set(capabilities))
});
const intent = {
    crossfade: { enabled: true, mode: 'smart', duration: 4000 },
    fading: { enabled: true, ducking: { duration: 200 } },
    audioTrackId: 'es', loudnessNormalizer: true, nextTrack: { encoded: 'preload' }
};

test('cross-backend recovery omits native NodeLink controls and preserves common playback', () => {
    const payload = { track: { encoded: 'song' }, volume: 75, position: 4500, paused: true };
    const original = structuredClone(payload);
    const desired = structuredClone(intent);
    const suspended = [];
    projectAdvancedAudio(payload, node(false), intent, suspended);
    assert.deepEqual(payload, original);
    assert.deepEqual(new Set(suspended), new Set(['crossfade', 'fading', 'audioTrackId', 'loudnessNormalizer', 'nextTrack']));
    assert.deepEqual(intent, desired);
});

test('returning to NodeLink restores remembered compatible settings, not unavailable features', () => {
    const target = node(true);
    target.backend.recordFeature('crossfade', 'unavailable');
    const payload = { track: { encoded: 'song' } };
    const suspended = [];
    projectAdvancedAudio(payload, target, intent, suspended);
    assert.deepEqual(suspended, ['crossfade']);
    assert.deepEqual(payload.track, { encoded: 'song', audioTrackId: 'es' });
    assert.equal(payload.loudnessNormalizer, true);
    assert.deepEqual(payload.fading, intent.fading);
    assert.notEqual(payload.fading, intent.fading);
    assert.equal(payload.nextTrack.encoded, 'preload');
});

test('recovery filters preserve common filters and retain native preferences for later restoration', () => {
    const player = { node: node(true), manager: { options: {}, emit() {} }, updateData() {} };
    const filters = new Filters(player);
    filters.setEcho({ delay: 20 });
    filters.setVolume(0.8);
    player.node = node(false);
    const suspended = [];
    assert.deepEqual(filters.toPayload({ compatibleOnly: true, suspended }), { volume: 0.8 });
    assert.deepEqual(suspended, ['filter:echo']);
    assert.throws(() => filters.toPayload());
    player.node = node(true);
    assert.deepEqual(filters.toPayload(), { volume: 0.8, echo: { delay: 20 } });
});

test('explicit unavailable filter on NodeLink is not sent', () => {
    const target = node(true);
    target.backend.recordFeature('filter:echo', 'unavailable');
    const filters = { echo: { delay: 20 }, rotation: { rotationHz: 0.2 } };
    assert.deepEqual(suspendNativeFilters(filters, target), ['filter:echo']);
    assert.deepEqual(filters, { rotation: { rotationHz: 0.2 } });
});
