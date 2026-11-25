const test = require('node:test');
const assert = require('node:assert/strict');
const { captureMixRecovery, restoreMixRecovery } = require('../dist/src/players/MixRecovery');

const track = { encoded: 'encoded', info: {
    title: 'Layer', author: 'Artist', identifier: 'id', sourceName: 'youtube',
    length: 180000, position: 0, isSeekable: true, isStream: false, uri: 'https://example.com/song'
}, pluginInfo: {}, userData: {} };
const layer = { id: 'source-1', track, volume: 0.4, position: 100, startTime: 1 };
function fixture() {
    const source = { isNodeLink: true, connected: true, sessionId: 'source', backend: { kind: 'nodelink' },
        rest: { async getMixLayers() { return { mixes: [layer] }; } } };
    const calls = [];
    const target = { isNodeLink: true, connected: true, sessionId: 'target', backend: { kind: 'nodelink' },
        manager: { options: {} }, rest: {
            async addMixLayer(guild, body) { calls.push(['add', guild, body]); return { id: 'target-1', track, volume: body.volume }; },
            async removeMixLayer(guild, id) { calls.push(['remove', guild, id]); }
        } };
    const player = { guildId: '123456789012345678', node: target, playing: true, paused: false };
    const guard = new AbortController();
    return { source, target, player, calls, guard, active: () => !guard.signal.aborted };
}

test('recovery recreates a confirmed layer with a new target ID and original volume', async () => {
    const f = fixture();
    const capture = await captureMixRecovery(f.player, f.source, { mode: 'restart' }, f.active, f.guard.signal);
    const result = await restoreMixRecovery(f.player, f.source, f.target, capture, f.active, f.guard.signal);
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.restored, [{ sourceId: 'source-1', targetId: 'target-1' }]);
    assert.deepEqual(f.calls, [['add', f.player.guildId, { track: { encoded: 'encoded' }, volume: 0.4 }]]);
});

test('unavailable source, paused target and expired snapshots never recreate a layer', async () => {
    const f = fixture();
    f.source.connected = false;
    const missing = await captureMixRecovery(f.player, f.source, { mode: 'restart' }, f.active, f.guard.signal);
    assert.equal(missing.report.status, 'unavailable');
    f.source.connected = true;
    const capture = await captureMixRecovery(f.player, f.source, { mode: 'restart' }, f.active, f.guard.signal);
    f.player.paused = true;
    assert.equal((await restoreMixRecovery(f.player, f.source, f.target, capture, f.active, f.guard.signal)).status, 'skipped');
    f.player.paused = false;
    capture.capturedAt = Date.now() - 31000;
    assert.equal((await restoreMixRecovery(f.player, f.source, f.target, capture, f.active, f.guard.signal)).status, 'skipped');
    assert.deepEqual(f.calls, []);
});

test('late acknowledged layer is removed when a newer playback intent wins', async () => {
    const f = fixture();
    const capture = await captureMixRecovery(f.player, f.source, { mode: 'restart' }, f.active, f.guard.signal);
    const add = f.target.rest.addMixLayer;
    f.target.rest.addMixLayer = async (...args) => {
        const result = await add(...args);
        f.guard.abort();
        return result;
    };
    const report = await restoreMixRecovery(f.player, f.source, f.target, capture, f.active, f.guard.signal);
    assert.equal(report.failed, 1);
    assert.deepEqual(report.restored, []);
    assert.deepEqual(f.calls.at(-1), ['remove', f.player.guildId, 'target-1']);
});
