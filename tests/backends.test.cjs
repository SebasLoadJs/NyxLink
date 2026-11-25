const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlayer, deferred } = require('./helpers/player.cjs');

function info(overrides = {}) {
  return { version: { semver: '4.2.2' }, sourceManagers: ['http'], filters: ['volume'], ...overrides };
}

test('a string false marker cannot identify a server as NodeLink', async t => {
  const { node } = createPlayer(t);
  node.rest.getInfoWithHeaders = async () => ({ data: info({ isNodelink: 'false' }), headers: {} });
  await node.open();
  assert.equal(node.isNodeLink, false);
});

test('a validated NodeLink marker supplies identity but does not invent optional endpoint support', async t => {
  const { node } = createPlayer(t);
  node.rest.getInfoWithHeaders = async () => ({ data: info({ isNodelink: true, version: { semver: '3.10.0' } }), headers: {} });
  await node.open();
  assert.equal(node.backend.kind, 'nodelink');
  assert.equal(node.backend.supports('source:http'), true);
  assert.equal(node.backend.featureStatus('trackstream'), 'unknown');
});

test('a true response header identifies NodeLink even without the body marker', async t => {
  const { node } = createPlayer(t);
  node.rest.getInfoWithHeaders = async () => ({ data: info(), headers: { iamnodelink: 'true' } });
  await node.open();
  assert.equal(node.isNodeLink, true);
});

test('capability metadata ignores malformed source and filter entries', async t => {
  const { node } = createPlayer(t);
  node.rest.getInfoWithHeaders = async () => ({ data: info({ sourceManagers: ['http', 3, null, {}], filters: ['volume', false] }), headers: {} });
  await node.open();
  assert.ok(node.capabilities.has('source:http'));
  assert.equal([...node.capabilities].some(value => /null|object|false|:3$/.test(value)), false);
});

test('a failed metadata refresh cannot retain capabilities from the previous connection', async t => {
  const { node } = createPlayer(t);
  node.rest.getInfoWithHeaders = async () => ({ data: info({ isNodelink: true }), headers: {} });
  await node.open();
  node.rest.getInfoWithHeaders = async () => { throw new Error('info unavailable'); };
  await node.open();
  assert.equal(node.isNodeLink, false);
  assert.equal(node.backend, undefined);
  assert.equal(node.capabilities.size, 0);
});

test('metadata received after destruction cannot restore backend identity or capabilities', async t => {
  const { node } = createPlayer(t);
  const response = deferred();
  node.rest.getInfoWithHeaders = () => response.promise;
  const opening = node.open();
  await node.destroy();
  response.resolve({ data: info({ isNodelink: true }), headers: {} });
  await opening;
  assert.equal(node.isNodeLink, false);
  assert.equal(node.capabilities.size, 0);
});

test('overlapping metadata refreshes on one connection share a single request', async t => {
  const {node}=createPlayer(t);
  const entered=deferred(), release=deferred();
  let calls=0;
  node.rest.getInfoWithHeaders=async()=>{calls++;entered.resolve();return release.promise;};
  const first=node.refreshBackend(), second=node.refreshBackend();
  assert.equal(first,second);
  await entered.promise;
  release.resolve({data:info(),headers:{}});
  assert.deepEqual(await Promise.all([first,second]),[true,true]);
  assert.equal(calls,1);
  assert.ok(Number.isFinite(node.backendRefreshedAt));
});

test('late discovery from an older opening cannot overwrite a newer adapter even with the same socket', async t=>{
  const {node,manager}=createPlayer(t);
  const old=deferred(), entered=deferred();
  let calls=0, connected=0;
  manager.on('nodeConnected',()=>connected++);
  node.rest.getInfoWithHeaders=async()=>{if(++calls===1){entered.resolve();return old.promise;}return {data:info({sourceManagers:['youtube']}),headers:{}};};
  const opening=node.open();
  await entered.promise;
  await node.open();
  const adapter=node.backend;
  old.resolve({data:info({isNodelink:true}),headers:{}});
  await opening;
  assert.equal(node.backend,adapter);
  assert.equal(node.backend.kind,'lavalink');
  assert.deepEqual([...node.capabilities],['source:youtube','filter:volume']);
  assert.equal(connected,1);
});

test('an explicit refresh atomically replaces the inventory, not the prior adapter', async t=>{
  const {node}=createPlayer(t);
  node.rest.getInfoWithHeaders=async()=>({data:info({plugins:[{name:'example',version:'1.0.0'}]}),headers:{}});
  assert.equal(await node.refreshBackend(),true);
  const old=node.backend;
  old.recordFeature('example:endpoint','available');
  node.rest.getInfoWithHeaders=async()=>({data:info({sourceManagers:['youtube']}),headers:{}});
  assert.equal(await node.refreshBackend(),true);
  assert.equal(node.backend.supports('plugin:example'),false);
  assert.equal(node.backend.featureStatus('example:endpoint'),'unknown');
  assert.equal(old.supports('plugin:example'),true);
  assert.equal(old.featureStatus('example:endpoint'),'available');
  const current=node.backend;
  node.rest.getInfoWithHeaders=async()=>({data:{invalid:true},headers:{}});
  assert.equal(await node.refreshBackend(),false);
  assert.equal(node.backend,current);
});

test('manager inventory is detached, hides credentials and suppresses disconnected capabilities', async t=>{
  const {node,manager}=createPlayer(t);
  node.rest.getInfoWithHeaders=async()=>({data:info({plugins:[{name:'example',version:'1.0.0'}],secret:'private-info-sentinel'}),headers:{}});
  await node.refreshBackend();
  const [entry]=manager.nodes.getBackendInventory();
  assert.equal(entry.kind,'lavalink');
  assert.equal(entry.ready,true);
  assert.equal(entry.plugins[0].name,'example');
  assert.ok(!JSON.stringify(entry).includes('private-info-sentinel'));
  assert.ok(!JSON.stringify(entry).includes(node.password));
  entry.plugins[0].name='changed';
  entry.features.length=0;
  assert.equal(manager.nodes.getBackendInventory()[0].plugins[0].name,'example');
  node.connected=false;
  const [offline]=manager.nodes.getBackendInventory();
  assert.equal(offline.connected,false);
  assert.equal(offline.kind,undefined);
  assert.deepEqual(offline.features,[]);
  assert.equal(await node.refreshBackend(),false);
});

test('disconnect invalidates a pending metadata refresh', async t=>{
  const {node}=createPlayer(t);
  const entered=deferred(), release=deferred();
  node.rest.getInfoWithHeaders=async()=>{entered.resolve();return release.promise;};
  const refreshing=node.refreshBackend();
  await entered.promise;
  node.reconnect=()=>{};
  await node.close({code:1006,reason:'lost connection'});
  release.resolve({data:info({isNodelink:true}),headers:{}});
  assert.equal(await refreshing,false);
  assert.equal(node.backend,undefined);
});
