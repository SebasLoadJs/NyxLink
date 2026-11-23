'use strict';
const { connectRedis } = require('./redis-client.cjs');
const { ownedManager, GUILD } = require('./owned-manager.cjs');

async function main() {
  if (!process.send) throw new Error('IPC is required');
  const client = await connectRedis();
  const namespace = process.argv[2];
  const { manager, options } = await ownedManager(client, namespace);
  const player = await manager.players.createOwned(options);
  player.stopHealthCheck();
  await manager.database.flush();
  const lease = manager.guildOwnership.localLease(GUILD);
  process.send({ event: 'acquired', fencingToken: lease.fencingToken });
  let exiting = false;
  process.on('message', async message => {
    if (!message || message.event !== 'release' || exiting) return;
    exiting = true;
    try {
      await player.destroy('worker shutdown');
      await manager.shutdown();
      await client.close();
      process.send({ event: 'released' });
    } catch (error) {
      process.send({ event: 'error', message: String(error?.message ?? error) });
      process.exitCode = 1;
    }
  });
}
main().catch(error => {
  process.send?.({ event: 'error', message: String(error?.message ?? error) });
  process.exitCode = 1;
});
