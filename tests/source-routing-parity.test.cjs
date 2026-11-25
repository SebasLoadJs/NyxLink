const test = require('node:test');
const assert = require('node:assert/strict');
const { SearchService } = require('../dist/src/search/SearchService');
const { sourcePrefix, disabledSource, requiresNodeLink } = require('../dist/src/search/SourceRouting');
const { BackendDetector } = require('../dist');
const empty = { loadType: 'empty', data: {} };

function fixture(options = {}, response = empty) {
    const calls = [], selections = [];
    let nativeCalls = 0;
    const node = {
        identifier: 'node', connected: true, sessionId: 's',
        backend: BackendDetector.detect({ version: { semver: '3.10.0' }, isNodelink: true }),
        assertFeature() {},
        rest: { async loadTracks(identifier) { calls.push(identifier); return response; } }
    };
    const manager = { options, emit() {}, nodes: { nodes: new Map([['node', node]]), findNode(options) { selections.push(options); return node; } } };
    const service = new SearchService(manager, async () => { nativeCalls++; return null; });
    return { calls, selections, service, nativeCalls: () => nativeCalls };
}

test('selected international aliases resolve to verified NodeLink prefixes', async () => {
    const f = fixture({ search: { sourceHealth: true } });
    try {
        for (const [alias, prefix] of [['AmazonMusic','azsearch'],['lastfm','lfsearch'],['shazam','shsearch'],['songlink','slsearch']]) {
            assert.equal(sourcePrefix(alias), prefix);
            assert.ok(requiresNodeLink(alias));
            await f.service.search({ query: 'artist', source: alias });
            assert.equal(f.calls.at(-1), prefix + ':artist');
            assert.equal(f.selections.at(-1).backend, 'nodelink');
            assert.equal(f.selections.at(-1).preferSource, alias.toLowerCase());
        }
    } finally { f.service.close(); }
});
test('explicit backend search never invokes a local provider', async () => {
    const f = fixture();
    try {
        await f.service.search({ query: 'artist', source: 'spsearch', node: 'node' });
        assert.equal(f.nativeCalls(), 0);
        assert.deepEqual(f.calls, ['spsearch:artist']);
    } finally { f.service.close(); }
});
test('disabled provider aliases cannot trigger provider requests or fallback', async () => {
    assert.ok(disabledSource('azsearch', ['AmazonMusic']));
    assert.ok(disabledSource('sprec', ['spotify']));
    const f = fixture({ sources: { disabledSources: ['AmazonMusic','spotify'] }, search: { fallbackPlatforms: ['spsearch','youtube'] } });
    try {
        await assert.rejects(f.service.search({ query: 'song', source: 'azsearch' }), /disabled/);
        assert.equal(f.nativeCalls(), 0);
        await f.service.search({ query: 'song', source: 'soundcloud' });
        assert.deepEqual(f.calls, ['scsearch:song', 'ytsearch:song']);
    } finally { f.service.close(); }
});
test('upstream provider errors are not reinterpreted as empty search results', async () => {
    const f = fixture({ search: { fallbackPlatforms: ['youtube'] } }, { loadType: 'error', data: { message: 'provider rejected', severity: 'fault' } });
    try {
        const result = await f.service.search({ query: 'song', source: 'soundcloud' });
        assert.equal(result.loadType, 'error');
        assert.deepEqual(f.calls, ['scsearch:song']);
    } finally { f.service.close(); }
});
