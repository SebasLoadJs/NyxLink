const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlayer, deferred } = require('./helpers/player.cjs');

test('player storage rejects mismatched guild identity in root and field writes', async t => {
  const { manager, player } = createPlayer(t);
  const key = 'players.' + player.guildId;
  const foreign = '123456789012345679';
  await manager.database.set(key, { guildId: player.guildId, volume: 100 });
  await assert.rejects(manager.database.set(key, { guildId: foreign }), /guild does not match/);
  await assert.rejects(manager.database.set(key + '.guildId', foreign), /guild does not match/);
  await assert.rejects(manager.database.remove(key + '.guildId'), /guild identity/);
  assert.equal(await manager.database.get(key + '.guildId'), player.guildId);
});

test('queued player writes cannot inherit a replacement guild lease', async t => {
  const { manager, player } = createPlayer(t);
  await manager.database.flush();
  const key = 'players.' + player.guildId;
  const oldLease = { guildId: player.guildId, fencingToken: 1 };
  let held = oldLease;
  manager.guildOwnership = {
    assertLocal() {}, localLease() { return held; }, async assertCurrent() {}
  };
  const entered = deferred(), release = deferred();
  const originalSet = manager.database.provider.set.bind(manager.database.provider);
  manager.database.provider.set = async (path, value) => {
    if (path === 'blocking-test') { entered.resolve(); await release.promise; }
    return originalSet(path, value);
  };
  try {
    const blocking = manager.database.set('blocking-test', true);
    await entered.promise;
    const queued = manager.database.set(key + '.volume', 42);
    const rejected = assert.rejects(queued, { code: 'SNAPSHOT_CONFLICT' });
    held = { guildId: player.guildId, fencingToken: 2 };
    release.resolve();
    await blocking;
    await rejected;
    assert.notEqual(await manager.database.get(key + '.volume'), 42);
    await manager.database.set(key + '.volume', 43);
    assert.equal(await manager.database.get(key + '.volume'), 43);
  } finally {
    release.resolve();
    manager.guildOwnership = undefined;
  }
});

test('shared storage blocks namespace-wide or malformed player mutations', async t => {
  const { manager } = createPlayer(t);
  await manager.database.flush();
  manager.guildOwnership = {};
  try {
    for (const key of ['players', 'players.invalid', 'players.123']) {
      await assert.rejects(manager.database.set(key, {}), { code: 'SNAPSHOT_CONFLICT' });
      await assert.rejects(manager.database.remove(key), { code: 'SNAPSHOT_CONFLICT' });
    }
  } finally { manager.guildOwnership = undefined; }
});
