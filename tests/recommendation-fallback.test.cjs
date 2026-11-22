const test = require('node:test');
const assert = require('node:assert/strict');
const { RecommendationResolver } = require('../dist/src/autoplay/RecommendationResolver.js');

function fixture(results) {
  const calls = [];
  const node = {
    identifier: 'test-node',
    isNodeLink: false,
    manager: {
      options: { search: { defaultPlatform: 'soundcloud' } },
      emit() {},
      async search(query) {
        calls.push(query);
        return results[calls.length - 1] ?? { loadType: 'empty', tracks: [] };
      },
    },
  };
  const player = { previous: [], queue: { tracks: [] }, recommendations: [], destroyed: false };
  const seed = { sourceName: 'spotify', identifier: 'spotify-seed', title: 'Song', author: 'Artist' };
  return { calls, node, player, seed };
}

const youtube = { sourceName: 'youtube', identifier: 'dQw4w9WgXcQ' };
const soundcloud = { sourceName: 'soundcloud', identifier: '12345678901' };
const recommendation = { sourceName: 'youtube', identifier: 'abcdefghijk' };

test('non-native fallback explicitly requests YouTube and skips foreign source results', async () => {
  const { node, player, seed, calls } = fixture([
    { loadType: 'search', tracks: [soundcloud, youtube] },
    { loadType: 'playlist', tracks: [recommendation] },
  ]);
  await RecommendationResolver.update(node, player, seed);
  assert.equal(calls[0].source, 'youtube');
  assert.equal(calls[1].query, `https://www.youtube.com/watch?v=${youtube.identifier}&list=RD${youtube.identifier}`);
  assert.deepEqual(player.recommendations, [recommendation]);
});

test('foreign source identifiers cannot become YouTube mix URLs', async () => {
  const { node, player, seed, calls } = fixture([{ loadType: 'search', tracks: [soundcloud] }]);
  await RecommendationResolver.update(node, player, seed);
  assert.equal(calls.length, 1);
  assert.deepEqual(player.recommendations, []);
});

test('invalid YouTube identifiers cannot become mix URLs', async () => {
  const { node, player, seed, calls } = fixture([{ loadType: 'search', tracks: [{ sourceName: 'youtube', identifier: 'bad&id=x' }] }]);
  await RecommendationResolver.update(node, player, seed);
  assert.equal(calls.length, 1);
});

test('direct YouTube recommendation path does not require an extra lookup', async () => {
  const { node, player, calls } = fixture([{ loadType: 'playlist', tracks: [recommendation] }]);
  await RecommendationResolver.update(node, player, youtube);
  assert.equal(calls.length, 1);
  assert.deepEqual(player.recommendations, [recommendation]);
});
