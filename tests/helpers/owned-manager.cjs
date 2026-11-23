'use strict';
const { Manager, Node, RedisGuildLeaseCoordinator } = require('../../dist');
const { DatabaseManager } = require('../../dist/src/managers/DatabaseManager.js');
const { NodeState } = require('../../dist/src/typings/types.js');

const GUILD = '123456789012345678';
const VOICE = '223456789012345678';
const nodeConfig = {
  identifier: 'redis-test-node', host: '127.0.0.1', port: 2333,
  password: 'local-only', secure: false,
};

async function ownedManager(client, namespace, opts = {}) {
  const activity = { gateway: [], updates: [], deletions: [] };
  const manager = new Manager({
    nodes: [nodeConfig],
    send(guildId, payload) { activity.gateway.push({ guildId, payload }); },
    options: { database: opts.storage ? { type: 'external', adapter: opts.storage } : { type: 'memory' } },
  });
  manager.database = new DatabaseManager(manager);
  await manager.database.initialize();
  const node = new Node(manager, nodeConfig);
  node.connected = true;
  node.state = NodeState.READY;
  manager.nodes.nodes.set(node.identifier, node);
  node.rest.updatePlayer = async (guildId, data) => {
    activity.updates.push({ guildId, data });
    return { guildId, ...data };
  };
  node.rest.destroyPlayer = async guildId => { activity.deletions.push(guildId); };
  const coordinator = new RedisGuildLeaseCoordinator({
    client, namespace, ttlMs: opts.ttlMs ?? 1000,
  });
  manager.useGuildLeases({ coordinator, renewIntervalMs: opts.renewIntervalMs ?? 200 });
  const options = { guildId: GUILD, voiceChannelId: VOICE, node: node.identifier };
  return { manager, node, coordinator, activity, options };
}

module.exports = { ownedManager, GUILD, VOICE };
