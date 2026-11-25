const test = require('node:test');
const assert = require('node:assert/strict');
const { BackendDetector, Filters, Track, SearchResult, FeatureUnavailableError, readLavaSrcTrackMetadata } = require('../dist');
const { normalizeLavaDSPX } = require('../dist/src/backends/LavaDSPXContracts');
const backend = (plugins = [], isNodelink = false) => BackendDetector.detect({ version: { semver: '4.2.2' }, plugins, isNodelink });
const plugins = [{ name: 'lavadspx-plugin', version: '0.0.5' }, { name: 'lavasrc-plugin', version: '4.8.0' }];

test('Lavalink recognizes actual DSPX and LavaSrc plugin names', () => {
    assert.equal(backend(plugins).supports('lavadspx'), true);
    assert.equal(backend(plugins).supports('lavasrc'), true);
    assert.equal(backend().supports('lavadspx'), false);
    assert.equal(backend(plugins, true).featureStatus('lavadspx'), 'unavailable');
});

test('typed DSPX options enforce positive and finite native values', () => {
    assert.deepEqual(normalizeLavaDSPX('high-pass', { cutoffFrequency: 80 }), { cutoffFrequency: 80 });
    for (const [key, value] of [
        ['high-pass', { cutoffFrequency: 1.5 }],
        ['low-pass', { cutoffFrequency: 80, boostFactor: Infinity }],
        ['echo', { echoLength: 0.3, decay: 0 }],
        ['normalization', { maxAmplitude: 1.1 }]
    ]) assert.throws(() => normalizeLavaDSPX(key, value), TypeError);
});

test('DSPX effects use pluginFilters and recover only on compatible Lavalink nodes', () => {
    const player = { node: { isNodeLink: false, backend: backend(plugins) }, manager: { options: {}, emit() {} }, updateData() {} };
    const filters = new Filters(player);
    filters.setPluginFilters({ other: { enabled: true } });
    filters.setLavaDSPX('echo', { echoLength: 0.3, decay: 0.5 });
    filters.setLavaDSPX('high-pass', { cutoffFrequency: 80 });
    const full = filters.toPayload();
    assert.equal(full.echo, undefined);
    assert.deepEqual(full.pluginFilters['high-pass'], { cutoffFrequency: 80 });
    player.node = { isNodeLink: true, backend: backend([], true) };
    assert.throws(() => filters.setLavaDSPX('normalization', { maxAmplitude: 0.8 }), FeatureUnavailableError);
    assert.throws(() => filters.toPayload(), FeatureUnavailableError);
    const suspended = [];
    assert.deepEqual(filters.toPayload({ compatibleOnly: true, suspended }).pluginFilters, { other: { enabled: true } });
    assert.deepEqual(new Set(suspended), new Set(['lavadspx:echo', 'lavadspx:high-pass']));
    player.node = { isNodeLink: false, backend: backend(plugins) };
    assert.deepEqual(filters.toPayload(), full);
    filters.setLavaDSPX('echo');
    assert.equal(filters.toPayload().pluginFilters.echo, undefined);
});

test('LavaSrc metadata distinguishes unknown preview from false and preserves collection totals', () => {
    const pluginInfo = { albumName: 'Album', albumArtUrl: null, artistArtworkUrl: 'https://example.com/artist', isPreview: false, extra: true };
    const raw = { encoded: 'encoded', info: { title: 'Song', author: 'Artist', length: 1000, position: 0, identifier: 'id', sourceName: 'spotify', isStream: false, isSeekable: true, uri: null }, pluginInfo };
    const track = new Track(raw, undefined, undefined, []);
    assert.equal(track.getLavaSrcMetadata().isPreview, false);
    assert.equal(track.getLavaSrcMetadata().albumArtUrl, null);
    assert.equal(track.pluginInfo.extra, true);
    assert.equal(readLavaSrcTrackMetadata({ isPreview: 'false' }), undefined);
    const collection = { type: 'album', author: 'Artist', totalTracks: 50, unknownField: { kept: true } };
    const result = new SearchResult({ loadType: 'playlist', data: { info: { name: 'Album', selectedTrack: -1 }, tracks: [raw, raw], pluginInfo: collection } }, undefined, 1, []);
    assert.equal(result.tracks.length, 1);
    assert.equal(result.getLavaSrcMetadata().totalTracks, 50);
    assert.equal(result.getLavaSrcMetadata().type, 'album');
    result.playlistPluginInfo.unknownField.kept = false;
    assert.equal(collection.unknownField.kept, true);
});
