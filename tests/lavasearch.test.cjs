const test = require('node:test');
const assert = require('node:assert/strict');
const { lavaSearchParameters, validateLavaSearch } = require('../dist/src/backends/LavaSearchContracts');
const { BackendDetector, FeatureUnavailableError, Rest, ProtocolResponseError } = require('../dist');
const http = require('node:http');

const result = {
    tracks: [], albums: [{ info: { name: 'Album', selectedTrack: -1 }, pluginInfo: { url: 'example' }, tracks: [] }],
    texts: [{ text: 'Artist', plugin: {} }], plugin: {}
};
const info = { version: { semver: '4.2.2' }, plugins: [{ name: 'lavasearch-plugin', version: '1.0.0' }] };

test('LavaSearch validates categories and encodes query parameters', () => {
    const params = lavaSearchParameters('spsearch:A & B', { types: ['album', 'artist'] });
    assert.equal(params.get('query'), 'spsearch:A & B');
    assert.equal(params.get('types'), 'album,artist');
    for (const options of [{ types: [] }, { types: ['album', 'album'] }, { types: ['unknown'] }, { timeoutMs: 0 }]) {
        assert.throws(() => lavaSearchParameters('test', options), TypeError);
    }
    assert.throws(() => lavaSearchParameters(' '), TypeError);
});

test('LavaSearch validates response categories without losing plugin metadata', () => {
    validateLavaSearch(result);
    for (const payload of [{}, { plugin: {}, tracks: [{}] }, { plugin: {}, texts: [{ text: 42 }] },
        { plugin: {}, albums: [{ info: { name: 'broken' } }] }]) {
        assert.throws(() => validateLavaSearch(payload), ProtocolResponseError);
    }
});

test('LavaSearch capability is advertised only for a Lavalink plugin', () => {
    assert.equal(BackendDetector.detect(info).supports('lavasearch'), true);
    assert.equal(BackendDetector.detect({ ...info, plugins: [] }).supports('lavasearch'), false);
    assert.equal(BackendDetector.detect({ ...info, isNodelink: true }).supports('lavasearch'), false);
});

test('LavaSearch REST uses its native path, handles 204 and rejects unavailable backends', async () => {
    let mode = 'ok';
    let requests = 0;
    const server = http.createServer((req, res) => {
        requests++;
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/v4/loadsearch' || url.searchParams.get('query') !== 'spsearch:A & B' ||
            url.searchParams.get('types') !== 'album,text' || req.headers.authorization !== 'test-password') {
            res.writeHead(400).end();
            return;
        }
        if (mode === 'empty') return res.writeHead(204).end();
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(mode === 'invalid' ? {} : result));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const node = { host: '127.0.0.1', port: server.address().port, password: 'test-password',
            manager: { options: {} }, backend: BackendDetector.detect(info), circuit: { run: fn => fn() } };
        const rest = new Rest(node);
        const opts = { types: ['album', 'text'] };
        assert.deepEqual(await rest.loadSearch('spsearch:A & B', opts), result);
        mode = 'empty';
        assert.equal(await rest.loadSearch('spsearch:A & B', opts), null);
        mode = 'invalid';
        await assert.rejects(rest.loadSearch('spsearch:A & B', opts), ProtocolResponseError);
        node.backend = BackendDetector.detect({ ...info, isNodelink: true });
        await assert.rejects(rest.loadSearch('spsearch:A & B', opts), FeatureUnavailableError);
        assert.equal(requests, 3);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
