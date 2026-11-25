const test = require('node:test');
const assert = require('node:assert/strict');
const { readSponsorBlockEvent, Node } = require('../dist');
const guildId = '123456789012345678';
const segment = { category: 'sponsor', start: 100, end: 3000 };
const event = (type, payload) => ({ op: 'event', guildId, type, ...payload });

test('distinct backends expose equivalent typed SponsorBlock observations', () => {
    for (const [backend, type] of [['nodelink', 'SponsorBlockSegmentsLoadedEvent'], ['lavalink', 'SegmentsLoaded']]) {
        assert.deepEqual(readSponsorBlockEvent(event(type, { segments: [segment] }), backend),
            { backend, guildId, kind: 'segmentsLoaded', segments: [segment] });
    }
    assert.deepEqual(readSponsorBlockEvent(event('SponsorBlockSegmentSkippedEvent', { segment }), 'nodelink'),
        { backend: 'nodelink', guildId, kind: 'segmentSkipped', segment });
    assert.equal(readSponsorBlockEvent(event('SegmentsLoaded', { segments: [segment] }), 'nodelink'), undefined);
    assert.equal(readSponsorBlockEvent(event('SponsorBlockSegmentsLoadedEvent', { segments: [segment] }), 'lavalink'), undefined);
});

test('chapter timestamps are normalized and malformed observations rejected', () => {
    const chapter = { name: 'Intro', start: 0, end: 3000, duration: '3000' };
    const payload = event('ChaptersLoaded', { chapters: [chapter] });
    const result = readSponsorBlockEvent(payload, 'lavalink');
    assert.deepEqual(result.chapters, [{ ...chapter, duration: 3000 }]);
    assert.equal(readSponsorBlockEvent(payload, 'nodelink'), undefined);
    assert.equal(readSponsorBlockEvent(event('SegmentsLoaded', { segments: [{ ...segment, end: 0 }] }), 'lavalink'), undefined);
    assert.equal(readSponsorBlockEvent(event('ChaptersLoaded', { chapters: [{ ...chapter, duration: 'bad' }] }), 'lavalink'), undefined);
    assert.equal(readSponsorBlockEvent({ ...payload, guildId: 'bad' }, 'lavalink'), undefined);
});

test('node dispatch emits only observations owned by the reporting player and backend', () => {
    const emitted = [];
    const node = { backend: { kind: 'lavalink' }, manager: { emit: (...args) => emitted.push(args) } };
    const player = { guildId, node };
    const dispatch = payload => Node.prototype.handleEvent.call(node, player, payload);
    dispatch(event('SegmentSkipped', { segment }));
    dispatch(event('SponsorBlockSegmentSkippedEvent', { segment }));
    dispatch({ ...event('SegmentSkipped', { segment }), guildId: '123456789012345679' });
    player.node = {};
    dispatch(event('SegmentSkipped', { segment }));
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0][0], 'sponsorBlockEvent');
    assert.equal(emitted[0][2].kind, 'segmentSkipped');
});
