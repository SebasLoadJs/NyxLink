const test = require('node:test');
const assert = require('node:assert/strict');
const { Node, NodeState, NodeFailover } = require('../dist');
const { createPlayer, createTrack } = require('./helpers/player.cjs');

for (const command of ['stop', 'play']) {
  test(`a synchronous ${command} from the migration listener cancels failover before another destination`, async t => {
    const { manager, node: source, player } = createPlayer(t);
    player.setAutoPlay(false);
    player.voice.connect = async () => {};
    const targets = ['first', 'second'].map((identifier, index) => {
      const target = new Node(manager, { identifier, host: '127.0.0.1', port: 2440 + index, password: 'test', secure: false });
      target.connected = true;
      target.state = NodeState.READY;
      target.rest.destroyPlayer = async () => {};
      manager.nodes.nodes.set(identifier, target);
      return target;
    });
    let targetUpdates = 0;
    for (const target of targets) target.rest.updatePlayer = async (_guild, payload) => { targetUpdates++; return payload; };
    t.after(async () => {
      for (const target of targets) await target.destroy();
      await manager.database.shutdown();
    });

    const initial = createTrack('initial');
    const latest = createTrack('latest');
    const queued = createTrack('queued');
    assert.equal(await player.play({ track: initial }), true);
    player.queue.add(queued);
    let migrations = 0;
    let userCommand;
    manager.on('playerNodeFailover', (_player, report) => {
      if (report.status !== 'in-progress') return;
      migrations++;
      if (migrations === 1) userCommand = command === 'stop' ? player.stop() : player.play({ track: latest });
    });

    const recovering = NodeFailover.move(player, source);
    const result = await recovering;
    await userCommand;
    assert.equal(result.status, 'cancelled');
    assert.equal(result.attempts, 1);
    assert.equal(migrations, 1);
    assert.equal(targetUpdates, 0);
    assert.equal(player.node, source);
    assert.equal(player.current, command === 'stop' ? null : latest);
    assert.deepEqual(player.queue.tracks, [queued]);
  });
}
