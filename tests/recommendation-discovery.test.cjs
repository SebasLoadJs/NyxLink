const test = require('node:test');
const assert = require('node:assert/strict');
const { RecommendationResolver } = require('../dist/src/autoplay/RecommendationResolver');
const { playbackGuard } = require('../dist/src/players/PlaybackGuard');
const { providerRecommendation, matchesRecommendationSeed, recommendationKeys } = require('../dist/src/autoplay/RecommendationDiscovery');

const track = (sourceName, identifier, isrc, title = 'Song') => ({
    encoded: sourceName + ':' + identifier, title, author: 'Artist',
    getInfo() { return { sourceName, identifier, isrc, title, author: 'Artist', length: 180000, isStream: false }; }
});

function fixture(search, options = {}) {
    const node = { identifier: 'node', isNodeLink: true,
        capabilities: new Set(['source:spotify', 'source:deezer', 'source:tidal']),
        manager: { options, search, emit() {} } };
    const player = { node, recommendations: [], previous: [], queue: { tracks: [] } };
    return { node, player };
}

test('native Tidal recommendation uses a verified numeric seed', () => {
    assert.deepEqual(providerRecommendation('tidal', '123'), { query: '123', source: 'tdrec' });
    assert.equal(providerRecommendation('tidal', 'track=123'), undefined);
});

test('cross-provider seed matching rejects different ISRCs and version titles', () => {
    const a = track('tidal', '1', 'USABC1234567');
    assert.ok(matchesRecommendationSeed(a, track('deezer', '2', 'USABC1234567'), 'deezer'));
    assert.equal(matchesRecommendationSeed(a, track('deezer', '2', 'USABC1234568'), 'deezer'), false);
    assert.equal(matchesRecommendationSeed(a, track('deezer', '2', null, 'Song (Live)'), 'deezer'), false);
    assert.ok(recommendationKeys(a).includes('isrc:USABC1234567'));
});

test('multi-provider recommendations use matching seeds and deduplicate recordings', async () => {
    const seed = track('tidal', '1', 'USABC1234567');
    const first = track('tidal', '2', 'USABC1234568');
    const duplicate = track('deezer', '3', 'USABC1234568');
    const second = track('deezer', '4', 'USABC1234569');
    const calls = [];
    const { node, player } = fixture(async query => {
        calls.push(query.source);
        if (query.source === 'tdrec') return { tracks: [seed, first, track('tidal', '5', null)] };
        if (query.source === 'dzsearch') return { tracks: [track('deezer', '1', 'USABC1234567')] };
        if (query.source === 'dzrec') return { tracks: [duplicate, second] };
        throw new Error('Unexpected provider');
    }, { recommendationDiscovery: { providers: ['deezer'], maxCandidates: 5 } });
    await RecommendationResolver.update(node, player, seed);
    assert.deepEqual(calls, ['tdrec', 'dzsearch', 'dzrec']);
    assert.deepEqual(player.recommendations.map(t => t.encoded), [first.encoded, second.encoded, 'tidal:5']);
});

test('disable autoplay cancels a pending recommendation even when transport ignores abort', async () => {
    let resolve;
    let entered;
    const started = new Promise(r => { entered = r; });
    let signal;
    const { node, player } = fixture(query => {
        signal = query.signal;
        entered();
        return new Promise(r => { resolve = r; });
    });
    const pending = RecommendationResolver.update(node, player, track('tidal', '1', null));
    await started;
    playbackGuard(player).cancelAutoPlay();
    await pending;
    assert.equal(signal.aborted, true);
    resolve({ tracks: [track('tidal', '2', null)] });
    await Promise.resolve();
    assert.deepEqual(player.recommendations, []);
});

test('native YouTube recommendation uses ytrec with an opt-in discovery configuration', async () => {
    const seed = track('youtube', 'abcdefghijk', null);
    const { node, player } = fixture(async query => {
        assert.equal(query.source, 'ytrec');
        assert.equal(query.query, 'abcdefghijk');
        return { tracks: [track('youtube', 'abcdefghijl', null)] };
    }, { recommendationDiscovery: { providers: ['tidal'] } });
    node.capabilities = new Set(['source:youtube']);
    await RecommendationResolver.update(node, player, seed);
    assert.equal(player.recommendations.length, 1);
});


test('a response from an old session cannot populate recommendations after reconnection', async () => {
    let release, enter;
    const entered = new Promise(resolve => { enter = resolve; });
    const { node, player } = fixture(async () => {
        enter();
        return new Promise(resolve => { release = resolve; });
    });
    node.sessionId = 'old-session';
    const pending = RecommendationResolver.update(node, player, track('tidal', '1', null));
    await entered;
    node.sessionId = 'new-session';
    release({ tracks: [track('tidal', '2', null)] });
    await pending;
    assert.deepEqual(player.recommendations, []);
});

test('a stale node callback cannot cancel a lookup belonging to the current node', async () => {
    let release, enter;
    const entered = new Promise(resolve => { enter = resolve; });
    const next = track('tidal', '2', null);
    const { node, player } = fixture(async () => {
        enter();
        return new Promise(resolve => { release = resolve; });
    });
    const seed = track('tidal', '1', null);
    const pending = RecommendationResolver.update(node, player, seed);
    await entered;
    const stale = { ...node, identifier: 'old-node' };
    await RecommendationResolver.update(stale, player, seed);
    release({ tracks: [next] });
    await pending;
    assert.deepEqual(player.recommendations, [next]);
});

test('provider lookup uses full internal metadata for partial tracks', async () => {
    const seed = track('tidal', '1', 'USABC1234567');
    delete seed.title;
    delete seed.author;
    const calls = [];
    const { node, player } = fixture(async query => {
        calls.push(query);
        if (query.source === 'tdrec') return { tracks: [] };
        if (query.source === 'dzsearch') return { tracks: [track('deezer', '1', 'USABC1234567')] };
        if (query.source === 'dzrec') return { tracks: [track('deezer', '2', null)] };
        throw new Error('Unexpected query');
    }, { recommendationDiscovery: { providers: ['deezer'] } });
    await RecommendationResolver.update(node, player, seed);
    assert.equal(calls.find(query => query.source === 'dzsearch').query, 'Song Artist');
    assert.equal(player.recommendations.length, 1);
});
