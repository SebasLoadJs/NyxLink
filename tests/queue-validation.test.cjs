const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlayer, createTrack } = require('./helpers/player.cjs');

test('queue mutations reject invalid indices and counts without corrupting state', async t => {
  const { player, manager } = createPlayer(t);
  const q = player.queue;
  const a = createTrack('a'), b = createTrack('b'), c = createTrack('c');
  q.add([a,b,c]);
  let changes = 0;
  for (const event of ['queueAdd','queueRemove','queueMoveRange','queueRemoveRange','queueDuplicate']) manager.on(event, () => changes++);
  for (const invalid of [NaN, Infinity, 0.5, '1']) {
    q.insert(invalid, a); q.shuffleRange(invalid, 2);
    assert.equal(q.remove(invalid), undefined);
    assert.equal(q.move(invalid, 0), false);
    assert.equal(q.moveRange(0, 1, invalid), false);
    assert.equal(q.removeRange(0, invalid), false);
    assert.equal(q.duplicate(0, invalid), false);
    assert.equal(q.jump(invalid), false);
    assert.equal(q.swap(0, invalid), false);
    assert.equal(q.replace(invalid, a), false);
    assert.equal(q.truncate(invalid), false);
  }
  assert.deepEqual(q.tracks, [a,b,c]);
  assert.equal(changes, 0);
});

test('insert and replace respect the duplicate policy', async t => {
  const { player, manager } = createPlayer(t);
  manager.options.queue.allowDuplicates = false;
  const q = player.queue;
  const a = createTrack('a'), b = createTrack('b');
  q.add(a);
  q.insert(1, [a, b, b, null]);
  assert.deepEqual(q.tracks, [a,b]);
  assert.equal(q.replace(1, a), false);
  assert.equal(q.duplicate(0), false);
  assert.equal(q.replace(0, a), true);
});

test('duplicate respects maximum queue size before allocating copies', async t => {
  const { player, manager } = createPlayer(t);
  manager.options.queue.maxSize = 3;
  const q = player.queue;
  const a = createTrack('a');
  q.add(a);
  assert.equal(q.duplicate(0, Number.MAX_SAFE_INTEGER), false);
  assert.equal(q.duplicate(0, 3), false);
  assert.equal(q.duplicate(0, 2), true);
  assert.equal(q.size, 3);
});

test('truncate reports the inclusive end index of the removed range', async t => {
  const { player, manager } = createPlayer(t);
  const q = player.queue;
  const a = createTrack('a'), b = createTrack('b'), c = createTrack('c');
  q.add([a,b,c]);
  const events = [];
  manager.on('queueRemoveRange', (_player, tracks, start, end) => events.push({tracks,start,end}));
  assert.equal(q.truncate(1), true);
  assert.deepEqual(events, [{tracks:[b,c],start:1,end:2}]);
});

test('duplicate creates independent playback state and metadata for each queue entry', async t => {
  const { player, manager } = createPlayer(t);
  const q = player.queue;
  const original = createTrack('duplicate-independent');
  original.position = 23000;
  original.userData = { nested: { label: 'initial' } };
  original.pluginInfo = { nested: { quality: 100 } };
  q.add(original);
  const events = [];
  manager.on('queueDuplicate', (_player, tracks, index) => events.push({ tracks, index }));

  assert.equal(q.duplicate(0, 2), true);
  assert.equal(q.size, 3);
  assert.equal(q.tracks[0], original);
  assert.notEqual(q.tracks[1], original);
  assert.notEqual(q.tracks[2], original);
  assert.notEqual(q.tracks[1], q.tracks[2]);
  assert.deepEqual(q.tracks.map(track => track.encoded), Array(3).fill(original.encoded));
  assert.deepEqual(events, [{ tracks: q.tracks.slice(1), index: 0 }]);

  q.tracks[1].position = 0;
  q.tracks[1].userData.nested.label = 'changed';
  q.tracks[1].pluginInfo.nested.quality = 50;
  assert.equal(original.position, 23000);
  assert.equal(q.tracks[2].position, 23000);
  assert.equal(original.userData.nested.label, 'initial');
  assert.equal(q.tracks[2].userData.nested.label, 'initial');
  assert.equal(original.pluginInfo.nested.quality, 100);
  assert.equal(q.tracks[2].pluginInfo.nested.quality, 100);
});

test('failed duplicate does not partially mutate queue or emit duplicate event', async t => {
  const { player, manager } = createPlayer(t);
  const q = player.queue;
  const original = createTrack('duplicate-unserializable');
  original.userData = { circular: null };
  original.userData.circular = original.userData;
  // Persist a valid original first; it is intentionally made invalid only
  // for duplication, so the test observes the rollback boundary.
  const saved = createTrack('duplicate-valid');
  q.add(saved);
  let events = 0;
  manager.on('queueDuplicate', () => events++);
  q.tracks[0] = original;
  assert.equal(q.duplicate(0, 2), false);
  assert.deepEqual(q.tracks, [original]);
  assert.equal(events, 0);
});

test('invalid entries reject the whole add batch before any queue or event mutation', async t => {
  const { player, manager } = createPlayer(t);
  const q = player.queue;
  const original = createTrack('atomic-add-original');
  const valid = createTrack('atomic-add-valid');
  q.add(original);
  let events = 0;
  manager.on('queueAdd', () => events++);
  const invalid = { encoded: 'present-but-not-playable' };

  assert.throws(() => q.add([valid, invalid]), /playable Track/);
  assert.deepEqual(q.tracks, [original]);
  assert.equal(events, 0);
  // Historical null/undefined no-op behavior is retained for compatibility.
  q.add([null, valid, undefined]);
  assert.deepEqual(q.tracks, [original, valid]);
});

test('invalid insertion, unshift, and replacement cannot poison the queue', async t => {
  const { player, manager } = createPlayer(t);
  const q = player.queue;
  const first = createTrack('atomic-insert-first');
  const valid = createTrack('atomic-insert-valid');
  q.add(first);
  let events = 0;
  manager.on('queueAdd', () => events++);
  const invalid = { encoded: 'not-a-track' };

  assert.throws(() => q.insert(0, [valid, invalid]), /playable Track/);
  assert.throws(() => q.unshift(invalid), /playable Track/);
  assert.equal(q.replace(0, invalid), false);
  assert.deepEqual(q.tracks, [first]);
  assert.equal(events, 0);

  q.insert(0, [undefined, valid, null]);
  assert.deepEqual(q.tracks, [valid, first]);
});

test('queue entry validation supports playable Track-compatible subclasses', async t => {
  const { player } = createPlayer(t);
  const { Track } = require('../dist/index.js');
  const original = createTrack('queue-compatible');
  class ExtendedTrack extends Track {}
  const subclass = new ExtendedTrack(original.toJSON());
  // Accept an actual subclass with the internal Track metadata initialized.
  player.queue.add(subclass);
  assert.equal(player.queue.first, subclass);
  assert.equal(player.queue.size, 1);
});

test('custom track that throws during serialization cannot partially insert', async t => {
  const { player, manager } = createPlayer(t);
  const q = player.queue;
  const good = createTrack('serialize-good');
  const bad = {
    encoded: 'encoded-serialize-bad',
    getInfo: () => good.getInfo(),
    toJSON: () => { throw new Error('untrusted serialization'); },
  };
  let adds = 0;
  manager.on('queueAdd', () => adds++);

  assert.throws(() => q.add([good, bad]), /playable Track/);
  assert.throws(() => q.insert(0, [good, bad]), /playable Track/);
  assert.throws(() => q.unshift(bad), /playable Track/);
  assert.equal(q.replace(0, bad), false);
  assert.deepEqual(q.tracks, []);
  assert.equal(adds, 0);
});
