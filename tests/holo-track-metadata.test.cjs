const test = require('node:test');
const assert = require('node:assert/strict');
const { readHoloTrackMetadata, Track } = require('../dist');

test('Holo supports compound JSON fields from modern NodeLink', () => {
    const raw = { type: 'holo', views: 5, channelName: 'Artist',
        keywords: '["music","live"]', channel: '{"name":"Artist"}',
        audioTracks: '[{"id":"en","name":"English","isDefault":true,"isAutoDubbed":false}]',
        audioFormats: '[{"itag":251,"codec":"opus"}]', videoQualities: '[]',
        captions: '[]', externalLinks: '{"spotify":"https://example.com"}' };
    const value = readHoloTrackMetadata(raw);
    assert.deepEqual(value.keywords, ['music', 'live']);
    assert.deepEqual(value.audioTracks, [{ id: 'en', name: 'English', isDefault: true, isAutoDubbed: false }]);
    assert.equal(value.audioFormats[0].itag, 251);
    assert.equal(value.channel.name, 'Artist');
    assert.equal(typeof raw.channel, 'string');
    const track = new Track({ encoded: 'encoded', title: 'Test', author: 'Artist', pluginInfo: raw }, undefined, undefined, []);
    assert.deepEqual(track.getHoloMetadata(), value);
});

test('Holo handles older structured metadata, malformed fields and detached results', () => {
    const raw = { type: 'holo', keywords: 'invalid JSON', views: -1,
        audioTracks: [{ id: 'es', isDefault: true }, { id: 'es' }, { id: 1 }],
        audioFormats: [{ itag: 140 }], channel: { name: 'Artist' } };
    const value = readHoloTrackMetadata(raw);
    assert.equal(value.views, undefined);
    assert.deepEqual(value.keywords, []);
    assert.equal(value.audioTracks.length, 1);
    value.channel.name = 'Changed';
    value.audioFormats[0].itag = 0;
    assert.equal(raw.channel.name, 'Artist');
    assert.equal(raw.audioFormats[0].itag, 140);
    assert.equal(readHoloTrackMetadata({ type: 'vanilla' }), undefined);
});
