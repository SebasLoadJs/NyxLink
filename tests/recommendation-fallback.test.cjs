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

test('autoplay uses hidden source identifiers of partial tracks and excludes duplicate history', async () => {
  const {Track}=require('../dist');
  const make = id => new Track({
    encoded: 'encoded-'+id, info: {
      title:'Track',author:'Artist',identifier:id,sourceName:'youtube',
      length:180000,isSeekable:true,isStream:false,uri:'https://www.youtube.com/watch?v='+id,position:0
    },pluginInfo:{},userData:{}
  }, undefined, undefined, ['title']);
  const seed=make('dQw4w9WgXcQ');
  const history=make('abcdefghijk');
  const fresh=make('lmnopqrstuv');
  const {node,player,calls}=fixture([{loadType:'playlist',tracks:[history,fresh]}]);
  player.previous=[history];
  assert.equal(seed.identifier,undefined);
  await RecommendationResolver.update(node,player,seed);
  assert.equal(calls.length,1);
  assert.equal(calls[0].query,'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ');
  assert.deepEqual(player.recommendations,[fresh]);
});

test('direct YouTube seed rejects malformed identifiers before searching', async () => {
  const { node, player, calls } = fixture([]);
  await RecommendationResolver.update(node, player, {
    ...youtube, identifier: 'bad&id=evil',
  });
  assert.equal(calls.length, 0);
  assert.deepEqual(player.recommendations, []);
});

test('direct YouTube Music seed rejects malformed identifiers before searching', async () => {
  const { node, player, calls } = fixture([]);
  await RecommendationResolver.update(node, player, {
    sourceName: 'youtubemusic', identifier: 'bad?list=evil',
  });
  assert.equal(calls.length, 0);
  assert.deepEqual(player.recommendations, []);
});

test('direct YouTube Music seed accepts valid identifiers', async () => {
  const { node, player, calls } = fixture([
    { loadType: 'playlist', tracks: [recommendation] },
  ]);
  await RecommendationResolver.update(node, player, {
    sourceName: 'youtubemusic', identifier: youtube.identifier,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query,
    `https://music.youtube.com/watch?v=${youtube.identifier}&list=RD${youtube.identifier}`);
  assert.deepEqual(player.recommendations, [recommendation]);
});

test('empty seed lookup discards recommendations from the previous track', async () => {
  const { node, player, calls } = fixture([{ loadType: 'empty', tracks: [] }]);
  player.recommendations = [recommendation];
  await RecommendationResolver.update(node, player, youtube);
  assert.equal(calls.length, 1);
  assert.deepEqual(player.recommendations, []);
});

test('provider error leaves no stale recommendations available for autoplay', async () => {
  const { node, player } = fixture([{ loadType: 'error', tracks: [] }]);
  player.recommendations = [recommendation];
  await RecommendationResolver.update(node, player, youtube);
  assert.deepEqual(player.recommendations, []);
});

test('invalid seed cancels older lookup and clears its candidates', async () => {
  const { node, player, calls } = fixture([]);
  let resolveOld;
  node.manager.search = async query => {
    calls.push(query);
    return new Promise(resolve => { resolveOld = resolve; });
  };
  const oldLookup = RecommendationResolver.update(node, player, youtube);
  await RecommendationResolver.update(node, player, { ...youtube, identifier: 'invalid' });
  resolveOld({ loadType: 'playlist', tracks: [recommendation] });
  await oldLookup;
  assert.equal(calls.length, 1);
  assert.deepEqual(player.recommendations, []);
});

test('fallback accepts nested wire metadata and case-normalized YouTube sources', async () => {
  const { node, player, seed, calls } = fixture([
    { loadType: 'search', tracks: [
      { info: { sourceName: 'YouTube', identifier: youtube.identifier } },
    ] },
    { loadType: 'playlist', tracks: [recommendation] },
  ]);
  await RecommendationResolver.update(node, player, seed);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].query,
    `https://www.youtube.com/watch?v=${youtube.identifier}&list=RD${youtube.identifier}`);
  assert.deepEqual(player.recommendations, [recommendation]);
});
