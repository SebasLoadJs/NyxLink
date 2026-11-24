const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager } = require('../dist');
function fixture(options = {}) {
    const events = [];
    const target = Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(level => [level, (event, message) => events.push({ level, event, message })]));
    const manager = new Manager({
        nodes: [{ identifier: 'private-node', host: '127.0.0.1', port: 2333, password: 'private-password', secure: false }],
        options: { aurora: { level: 'debug', target, ...options } },
    });
    return { manager, events };
}
test('Aurora emits a single allowlisted event per signal and measures failover operation', async () => {
    const { manager, events } = fixture({ traceContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }) });
    try {
        const node = { backend: { kind: 'nodelink' }, identifier: 'private-id' };
        const player = { node, guildId: 'private-guild' };
        manager.emit('nodeReady', node, { token: 'private-token' });
        manager.emit('queueAdd', player, [{ title: 'private-title' }]);
        manager.emit('playerNodeFailover', player, { status: 'in-progress', source: 'private-source', target: 'private-target' });
        manager.emit('playerNodeFailover', player, { status: 'recovered', reason: 'private-reason' });
        assert.deepEqual(events.map(x => x.event.eventCode), ['NODE_READY','QUEUE_ADDED','FAILOVER_STARTED','FAILOVER_RECOVERED']);
        assert.equal(events[1].event.sanitizedContext.trackCount, 1);
        assert.equal(events[3].event.outcome, 'confirmed');
        assert.equal(events[2].event.operationId, events[3].event.operationId);
        assert.ok(events[3].event.durationMs >= 0);
        assert.ok(events.every(x => x.event.traceId === 'a'.repeat(32)));
        assert.doesNotMatch(JSON.stringify(events), /private-/);
    } finally { await manager.shutdown(); }
});
test('Aurora filters categories and levels and never invents recovery success or duration', async () => {
    const { manager, events } = fixture({ level: 'warn', categories: ['FAILOVER'] });
    const player = { node: { backend: { kind: 'lavalink' } } };
    try {
        manager.emit('nodeError', player.node, Error('private-error'));
        manager.emit('playerNodeFailover', player, { status: 'failed' });
        assert.deepEqual(events.map(x => x.event.eventCode), ['FAILOVER_FAILED']);
        assert.equal(events[0].event.durationMs, undefined);
        assert.equal(events[0].level, 'error');
    } finally { await manager.shutdown(); }
});
test('Aurora is silent by default, rejects dual routing and isolates sink failures', async () => {
    const { manager, events } = fixture({ level: 'silent' });
    manager.emit('nodeReady', {});
    assert.equal(events.length, 0);
    await manager.shutdown();
    const nodes = [{ host: '127.0.0.1', port: 2333, password: 'fixture', secure: false }];
    assert.throws(() => new Manager({ nodes, options: { logging: {}, aurora: {} } }), /not both/);
    const fail = () => { throw Error('sink failure'); };
    const second = fixture({ target: Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(level => [level, fail])), traceContext: fail });
    assert.doesNotThrow(() => second.manager.emit('nodeReady', {}));
    await second.manager.shutdown();
});
test('Aurora detaches from manager shutdown', async () => {
    const { manager, events } = fixture();
    await manager.shutdown();
    manager.emit('nodeReady', {});
    assert.equal(events.length, 0);
});

test('failover reason codes are fixed and never inferred from raw error text',async()=>{
 const {manager,events}=fixture();const player={node:{backend:{kind:'nodelink'}}};
 try{
  manager.emit('playerNodeFailover',player,{status:'in-progress'});
  manager.emit('playerNodeFailover',player,{status:'recovered',reason:'private-cleanup-error',reasonCode:'source-cleanup-failed'});
  manager.emit('playerNodeFailover',player,{status:'failed',reason:'private-error',reasonCode:'private-code'});
  assert.equal(events[1].event.sanitizedContext.reasonCode,'source-cleanup-failed');
  assert.equal(events[2].event.sanitizedContext.reasonCode,undefined);
  assert.doesNotMatch(JSON.stringify(events),/private-/);
 }finally{await manager.shutdown();}
});

test('canonical search, REST and player observations emit once and retain no private payloads',async()=>{
 const {manager,events}=fixture();
 try{
  const result={isError:false,tracks:[{title:'private-title'}]};
  manager.searches.search=async()=>result;
  assert.equal(await manager.search({query:'private-query'}),result);
  manager.searches.search=async()=>({isError:false,tracks:[]});
  await manager.search({query:'private-query'});
  const failure=Error('private-error');let calls=0;
  await assert.rejects(manager.aurora.observe('rest',async()=>{calls++;throw failure;}),e=>e===failure);
  assert.equal(calls,1);
  await manager.aurora.observe('stream',async()=>({body:'private-response'}));
  const player={node:{backend:{kind:'nodelink'}},guildId:'private-guild'};
  manager.emit('playerPause',player,true);
  manager.emit('filtersUpdate',player,{token:'private-token'});
  assert.deepEqual(events.map(x=>x.event.eventCode),['SEARCH_COMPLETED','SEARCH_EMPTY','REST_FAILED','STREAM_OPENED','PLAYER_PAUSED','FILTERS_UPDATED']);
  assert.ok(events.slice(0,4).every(x=>x.event.durationMs>=0&&x.event.operationId));
  assert.doesNotMatch(JSON.stringify(events),/private-/);
 }finally{await manager.shutdown();}
});

test('preferred logging option and deprecated aurora alias share one route; manual duplicate attachment is rejected',async()=>{
 const { Logger, AuroraEvents }=require('../dist');
 const records=[];
 const target=Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(level=>[level,event=>records.push(event)]));
 const manager=new Manager({nodes:[{host:'localhost',port:2333,password:'fixture',secure:false}],options:{logging:{level:'debug',target}}});
 const legacy=new Logger({level:'debug',console:false});
 const duplicate=new AuroraEvents({level:'debug',target});
 try{
  assert.equal(manager.logger,undefined);
  assert.ok(manager.aurora);
  assert.throws(()=>legacy.attachManager(manager),/already has a logging route/);
  assert.throws(()=>duplicate.attach(manager),/already has a logging route/);
  manager.emit('nodeReady',{backend:{kind:'lavalink'}},{});
  assert.equal(records.length,1);
  manager.detachLogger();
  manager.emit('nodeReady',{backend:{kind:'lavalink'}},{});
  assert.equal(records.length,1);
 }finally{duplicate.close();await legacy.close();await manager.shutdown();}
});
