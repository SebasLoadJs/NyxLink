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
