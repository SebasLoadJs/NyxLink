const test = require('node:test');
const assert = require('node:assert/strict');
const { Rest, FeatureUnavailableError } = require('../dist');
const { nodeLinkDiscoveryIdentifier } = require('../dist/src/backends/NodeLinkSearchContracts');

test('native discovery produces documented wire identifiers', () => {
    assert.equal(nodeLinkDiscoveryIdentifier('Daft Punk', { source: 'ytmsearch', type: 'album' }), 'ytmsearch:album:Daft Punk');
    assert.equal(nodeLinkDiscoveryIdentifier('lofi'), 'search:lofi');
    assert.equal(nodeLinkDiscoveryIdentifier('artist', { source: 'scsearch', type: 'user' }), 'scsearch:user:artist');
    for (const options of [{ source: 'ytsearch:album' }, { type: 'unknown' }, { timeoutMs: 0 }]) {
        assert.throws(() => nodeLinkDiscoveryIdentifier('query', options), TypeError);
    }
});

test('native discovery isolates backend and fences stale session results', async () => {
    const node = { backend: { kind: 'nodelink' }, sessionId: 's', manager: { options: {} } };
    const rest = new Rest(node);
    const calls = [];
    const response = { loadType: 'empty', data: {} };
    rest.loadTracks = async (identifier, options) => {
        calls.push({ identifier, timeoutMs: options.timeoutMs });
        return response;
    };
    assert.equal(await rest.loadNodeLinkSearch('artist', { source: 'ytmsearch', type: 'album' }), response);
    assert.deepEqual(calls, [{ identifier: 'ytmsearch:album:artist', timeoutMs: 10000 }]);
    node.backend = { kind: 'lavalink' };
    await assert.rejects(rest.loadNodeLinkSearch('artist'), FeatureUnavailableError);
    assert.equal(calls.length, 1);
    node.backend = { kind: 'nodelink' };
    rest.loadTracks = async () => { node.sessionId = 'new'; return response; };
    await assert.rejects(rest.loadNodeLinkSearch('artist'), /session changed/);
});
