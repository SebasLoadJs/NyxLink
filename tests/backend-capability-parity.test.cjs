const test = require('node:test');
const assert = require('node:assert/strict');
const { BackendDetector, LavalinkAdapter, NodeLinkAdapter } = require('../dist');
const { nodeLinkExtensionFeatures } = require('../dist/src/backends/ExtensionRoutes');
const { nodeLinkPlayerFeatures } = require('../dist/src/backends/ProtocolContracts');

test('Lavalink explicitly rejects NodeLink native contracts', () => {
    const backend = new LavalinkAdapter('4.2.2', new Set(['crossfade']));
    for (const feature of [...nodeLinkExtensionFeatures, ...nodeLinkPlayerFeatures, 'nodelink:discovery']) {
        assert.deepEqual(backend.describeFeature(feature), { feature, state: 'unavailable', evidence: 'protocol' });
        backend.recordFeature(feature, 'available');
        assert.equal(backend.supports(feature), false);
    }
    assert.equal(backend.supports('tracks:load'), true);
    assert.ok(backend.listFeatures().some(feature => feature.feature === 'crossfade' && feature.state === 'unavailable'));
});

test('NodeLink native features are unknown until advertised or observed', () => {
    const backend = new NodeLinkAdapter('3.10.0', new Set(['crossfade']));
    assert.equal(backend.featureStatus('crossfade'), 'available');
    assert.equal(backend.featureStatus('nextTrack'), 'unknown');
    assert.equal(backend.featureStatus('lavasearch'), 'unavailable');
    backend.recordFeature('nextTrack', 'available');
    assert.equal(backend.describeFeature('nextTrack').evidence, 'observed');
    backend.recordFeature('crossfade', 'unavailable');
    assert.equal(backend.supports('crossfade'), false);
    assert.ok(backend.listFeatures().some(feature => feature.feature === 'nextTrack'));
});

test('advertised Lavalink plugins expose native plugin contracts, not NodeLink routes', () => {
    const info = { version: { semver: '4.2.2' }, plugins: [
        { name: 'lavasearch-plugin', version: '1.0.0' },
        { name: 'lavalyrics-plugin', version: '1.1.0' },
        { name: 'sponsorblock-plugin', version: '3.0.1' }
    ] };
    const backend = BackendDetector.detect(info);
    for (const feature of ['lavasearch', 'lavalyrics', 'lavalink:sponsorblock']) {
        assert.equal(backend.describeFeature(feature).evidence, 'none');
        assert.equal(backend.featureStatus(feature), 'unknown');
    }
    for (const plugin of info.plugins) assert.equal(backend.supports('plugin:' + plugin.name), true);
    assert.equal(backend.featureStatus('sponsorblock'), 'unavailable');
    assert.equal(BackendDetector.detect({ ...info, isNodelink: true }).featureStatus('lavalyrics'), 'unavailable');
    assert.equal(BackendDetector.detect({ ...info, plugins: [] }).featureStatus('lavasearch'), 'unknown');
});
