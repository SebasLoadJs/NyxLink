const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlayer, deferred } = require('./helpers/player.cjs');

test('extensions are explicit, typed event observers and detach exactly once', async t => {
  const { manager, player } = createPlayer(t);
  let events = 0, disposed = 0, signal;
  const remove = await manager.useExtension({ name: 'observer', setup(context) { signal = context.signal; context.on('trackStart', () => { events++; }); }, dispose() { disposed++; } });
  manager.emit('trackStart', player, null);
  assert.equal(events, 1);
  await Promise.all([remove(), remove()]);
  manager.emit('trackStart', player, null);
  assert.equal(events, 1); assert.equal(disposed, 1); assert.equal(signal.aborted, true);
  assert.equal(await manager.removeExtension('observer'), false);
});

test('setup failure cleans installed listeners and permits a later registration', async t => {
  const { manager, player } = createPlayer(t);
  let events = 0, disposed = 0;
  await assert.rejects(manager.useExtension({ name: 'broken', setup(context) { context.on('trackStart', () => { events++; }); throw new Error('setup failed'); }, dispose() { disposed++; } }), { code: 'EXTENSION_SETUP_FAILED' });
  manager.emit('trackStart', player, null);
  assert.equal(events, 0); assert.equal(disposed, 1);
  const remove = await manager.useExtension({ name: 'broken', setup() {} }); await remove();
});

test('synchronous and asynchronous extension failures cannot interrupt other playback observers', async t => {
  const { manager, player } = createPlayer(t);
  const errors = []; let healthy = 0;
  manager.on('extensionError', (name, error) => errors.push([name, error.code]));
  const disposers = await Promise.all([
    manager.useExtension({ name: 'sync', setup(context) { context.on('trackStart', () => { throw new Error('sync'); }); } }),
    manager.useExtension({ name: 'async', setup(context) { context.on('trackStart', async () => { throw new Error('async'); }); } }),
    manager.useExtension({ name: 'healthy', setup(context) { context.on('trackStart', () => { healthy++; }); } }),
  ]);
  assert.doesNotThrow(() => manager.emit('trackStart', player, null));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(healthy, 1);
  assert.deepEqual(errors.map(([name]) => name).sort(), ['async', 'sync']);
  assert.ok(errors.every(([, code]) => code === 'EXTENSION_HANDLER_FAILED'));
  await Promise.all(disposers.map(dispose => dispose()));
});

test('extensionError observers cannot create recursive diagnostic failures', async t => {
  const { manager, player } = createPlayer(t); let notifications = 0;
  const remove = await manager.useExtension({ name: 'error-observer', setup(context) {
    context.on('extensionError', async () => { notifications++; throw new Error('cannot report to myself'); });
    context.on('trackStart', () => { throw new Error('trigger'); });
  } });
  manager.emit('trackStart', player, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notifications, 1);
  await remove();
});

test('manager shutdown aborts pending setup, releases hooks and still cleans other extensions', async t => {
  const { manager } = createPlayer(t);
  const entered = deferred(); let signal, disposed = 0;
  const registration = manager.useExtension({ name: 'pending', async setup(context) { signal = context.signal; entered.resolve(); await new Promise(() => {}); }, dispose() { disposed++; } });
  const rejected = assert.rejects(registration, { code: 'EXTENSION_SETUP_FAILED' });
  await entered.promise;
  await manager.shutdown(); await rejected;
  assert.equal(signal.aborted, true); assert.equal(disposed, 1);
  await assert.rejects(manager.useExtension({ name: 'after', setup() {} }), /shut down/);
});

test('setup and cleanup timeouts are bounded and surfaced to the caller', async t => {
  const { manager } = createPlayer(t);
  await assert.rejects(manager.useExtension({ name: 'setup-timeout', setup() { return new Promise(() => {}); } }, { setupTimeoutMs: 10 }), { code: 'EXTENSION_SETUP_FAILED' });
  const remove = await manager.useExtension({ name: 'cleanup-timeout', setup() {}, dispose() { return new Promise(() => {}); } }, { cleanupTimeoutMs: 10 });
  await assert.rejects(remove(), { code: 'EXTENSION_CLEANUP_FAILED' });
});

test('removing an initializing extension prevents hooks from becoming active after late setup', async t => {
  const { manager, player } = createPlayer(t); const entered = deferred(), release = deferred(); let events = 0;
  const registration = manager.useExtension({ name: 'pending', async setup(context) { context.on('trackStart', () => { events++; }); entered.resolve(); await release.promise; } });
  const rejected = assert.rejects(registration, { code: 'EXTENSION_SETUP_FAILED' });
  await entered.promise;
  assert.equal(await manager.removeExtension('pending'), true);
  release.resolve(); await rejected;
  manager.emit('trackStart', player, null); assert.equal(events, 0);
});

test('extension identity and duplicate registration are validated without replacing a live extension', async t => {
  const { manager } = createPlayer(t);
  for (const extension of [{}, { name: '../invalid', setup() {} }, { name: 'valid', setup: true }]) await assert.rejects(manager.useExtension(extension), TypeError);
  const remove = await manager.useExtension({ name: 'stable', setup() {} });
  await assert.rejects(manager.useExtension({ name: 'stable', setup() {} }), /already registered/);
  await remove();
});

test('extension-owned plugin events and routes are cleaned on removal and failed setup',async t=>{
 const {manager,node,player}=createPlayer(t);
 const {BackendDetector}=require('../dist');
 node.backend=BackendDetector.detect({version:{semver:'4.2.2'},plugins:[{name:'example',version:'1'}]});
 const event={backend:'lavalink',plugin:'example',type:'ExampleEvent',scope:'player',decode:raw=>raw.value};
 const route={backend:'lavalink',plugin:'example',id:'profile',scope:'node',method:'GET',path:'example/profile',decode:raw=>raw};
 let seen=0,registered;
 const remove=await manager.useExtension({name:'plugin-owner',setup(context){
   context.onPluginEvent(event,value=>{seen+=value;});
   registered=context.registerPluginRoute(route);
 }});
 const payload={op:'event',type:'ExampleEvent',guildId:player.guildId,value:2};
 manager.pluginEvents.dispatch(node,payload,()=>true);assert.equal(seen,2);
 assert.ok(manager.pluginRoutes.owns(registered));
 await remove();
 manager.pluginEvents.dispatch(node,payload,()=>true);assert.equal(seen,2);
 assert.equal(manager.pluginRoutes.owns(registered),false);
 assert.equal(manager.pluginEvents.list().length,0);
 await assert.rejects(manager.useExtension({name:'broken-plugin',setup(context){
   context.onPluginEvent(event,()=>{});context.registerPluginRoute(route);throw Error('fixture');
 }}),{code:'EXTENSION_SETUP_FAILED'});
 assert.equal(manager.pluginRoutes.list().length,0);assert.equal(manager.pluginEvents.list().length,0);
});
