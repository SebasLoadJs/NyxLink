const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager } = require('../dist');

function fixture(telemetry) {
    return new Manager({ nodes: [{ identifier: 'private-node-canary', host: '127.0.0.1', port: 2333, password: 'private-password-canary', secure: false }], options: { telemetry } });
}

function recording() {
    const events = [], durations = [], spans = [];
    return {
        events, durations, spans,
        meter: {
            createCounter(name) { assert.equal(name, 'nyxlink.events'); return { add(value, attributes) { events.push({ value, attributes }); } }; },
            createHistogram(name, options) { assert.equal(name, 'nyxlink.search.duration'); assert.equal(options.unit, 'ms'); return { record(value, attributes) { durations.push({ value, attributes }); } }; },
        },
        tracer: { startSpan(name) {
            const span = { name, attributes: {}, ended: 0 };
            spans.push(span);
            return {
                setStatus(status) { span.status = status; },
                setAttribute(key, value) { span.attributes[key] = value; },
                end() { span.ended++; },
            };
        } },
    };
}

test('optional telemetry records bounded lifecycle labels and detaches on shutdown', async () => {
    const data = recording();
    const manager = fixture(data);
    const node = { identifier: 'private-node-canary', backend: { kind: 'nodelink' } };
    const player = { guildId: 'private-guild-canary', node };
    manager.emit('nodeReady', node, { token: 'private-token-canary' });
    manager.emit('nodeError', node, Error('private-error-canary'));
    manager.emit('trackStart', player, { title: 'private-track-canary' });
    manager.emit('playerNodeFailover', player, { status: 'recovered', source: 'private-source-canary', target: 'private-target-canary' });
    manager.emit('nodeReady', { backend: { kind: 'private-backend-canary' } });
    assert.deepEqual(data.events.map(x => x.attributes), [
        { event: 'node.ready', backend: 'nodelink' },
        { event: 'node.error', backend: 'nodelink' },
        { event: 'track.start', backend: 'nodelink' },
        { event: 'failover.recovered', backend: 'nodelink' },
        { event: 'node.ready', backend: 'unknown' },
    ]);
    assert.doesNotMatch(JSON.stringify(data.events), /private-/);
    await manager.shutdown();
    const count = data.events.length;
    manager.emit('nodeReady', node);
    assert.equal(data.events.length, count);
});

test('telemetry records search success, empty and errors without leaking input or exception', async () => {
    const data = recording();
    const manager = fixture(data);
    const failure = Error('private-error-canary');
    try {
        manager.searches.search = async () => ({ isError: false, tracks: [{}] });
        const success = await manager.search({ query: 'private-query-canary' });
        assert.equal(success.tracks.length, 1);
        manager.searches.search = async () => ({ isError: false, tracks: [] });
        await manager.search({ query: 'private-query-canary' });
        manager.searches.search = async () => ({ isError: true, tracks: [], exception: { message: 'private-exception-canary' } });
        await manager.search({ query: 'private-query-canary' });
        manager.searches.search = async () => { throw failure; };
        await assert.rejects(manager.search({ query: 'private-query-canary' }), error => error === failure);
        assert.deepEqual(data.durations.map(x => x.attributes.outcome), ['success', 'empty', 'error', 'error']);
        assert.ok(data.durations.every(x => Number.isFinite(x.value) && x.value >= 0));
        assert.deepEqual(data.spans.map(x => x.status.code), [0, 0, 2, 2]);
        assert.ok(data.spans.every(x => x.name === 'nyxlink.search' && x.ended === 1));
        assert.doesNotMatch(JSON.stringify({ events: data.events, durations: data.durations, spans: data.spans }), /private-/);
    } finally { await manager.shutdown(); }
});

test('telemetry SDK failures do not alter search or event behavior', async () => {
    const fail = () => { throw Error('exporter unavailable'); };
    const manager = fixture({
        meter: { createCounter: () => ({ add: fail }), createHistogram: () => ({ record: fail }) },
        tracer: { startSpan: () => ({ setStatus: fail, setAttribute: fail, end: fail }) },
    });
    try {
        manager.emit('nodeReady', { backend: { kind: 'lavalink' } });
        const expected = { isError: false, tracks: [] };
        manager.searches.search = async () => expected;
        assert.equal(await manager.search({ query: 'test' }), expected);
    } finally { await manager.shutdown(); }
});

test('disabled telemetry preserves search behavior and does not require SDK', async () => {
    const manager = fixture(undefined);
    try {
        const expected = { isError: false, tracks: [] };
        manager.searches.search = async () => expected;
        assert.equal(await manager.search({ query: 'test' }), expected);
    } finally { await manager.shutdown(); }
});
