const test = require('node:test');
const assert = require('node:assert/strict');
const { diagnoseError, HttpError, FeatureUnavailableError, AuroraEvents, createAuroraPinoEngine } = require('../dist');
const { safeDiagnosticValue } = require('../dist/src/logging/SafeDiagnostics');

test('serialization never executes getters, custom inspect hooks or toJSON', () => {
  let calls = 0;
  const input = { visible: 'safe', get token() { calls++; throw new Error('getter'); }, get other() { calls++; return 'hidden'; },
    toJSON() { calls++; throw new Error('toJSON'); }, [Symbol.for('nodejs.util.inspect.custom')]() { calls++; throw new Error('inspect'); } };
  const result = safeDiagnosticValue(input);
  assert.equal(calls, 0);
  assert.equal(result.token, '[REDACTED]');
  assert.equal(result.other, '[Accessor]');
  assert.equal(result.visible, 'safe');
  assert.doesNotThrow(() => JSON.stringify(safeDiagnosticValue(new Proxy({}, { ownKeys() { throw new Error('proxy'); } }))));
});

test('diagnostics use known typed errors and do not invent an unknown root cause', () => {
  const unavailable = diagnoseError(new FeatureUnavailableError('mix:add', 'lavalink'));
  assert.equal(unavailable.code, 'FEATURE_UNAVAILABLE');
  assert.match(unavailable.action, /capability/);
  assert.match(diagnoseError(new HttpError(429)).action, /retry delay/);
  assert.match(diagnoseError(new HttpError(403)).action, /credentials/);
  assert.equal(diagnoseError(new Error('unclassified')).code, 'UNKNOWN_ERROR');
  assert.match(diagnoseError(new Error('unclassified')).action, /not been classified/);
});

test('pure diagnostics are detached, bounded, redact credentials and preserve ordinary context',()=>{
 const source={nested:{password:'PRIVATE_PASSWORD',session_id:'PRIVATE_SESSION',botToken:'PRIVATE_BOT',visible:3n},userData:{value:'PRIVATE_USER'},url:'https://user:PRIVATE_URL@example.org',message:'session_id=PRIVATE_INLINE'};
 source.self=source;
 const safe=safeDiagnosticValue(source);source.nested.visible=9n;
 assert.equal(safe.nested.visible,'3');assert.equal(safe.self,'[Circular]');
 assert.doesNotMatch(JSON.stringify(safe),/PRIVATE_/);
 const error=new Error('password=PRIVATE_ERROR');error.cause=error;
 const bounded=safeDiagnosticValue({error,huge:'z'.repeat(100000)});
 assert.ok(bounded.huge.length<=4096);assert.equal(bounded.error.cause,'[Circular]');
 assert.doesNotMatch(JSON.stringify(bounded),/PRIVATE_ERROR/);
});
test('canonical engine emits ordered detached allowlisted records, filters severity and stops after close',()=>{
 const events=[];
 const engine=createAuroraPinoEngine('info',(event,meta)=>events.push({event,meta}));
 const context={backend:'nodelink',token:'PRIVATE_TOKEN'};
 const ready={eventCode:'NODE_READY',sanitizedContext:context,timestamp:new Date().toISOString()};
 engine.target.info(ready,'PRIVATE_MESSAGE');context.backend='lavalink';
 engine.target.debug({eventCode:'QUEUE_ADDED',sanitizedContext:{trackCount:1}},'hidden');
 engine.target.error({eventCode:'NODE_ERROR',sanitizedContext:{backend:'lavalink',password:'PRIVATE_PASSWORD'}},'hidden');
 engine.close();engine.target.info(ready,'late');
 assert.deepEqual(events.map(x=>x.event.eventCode),['NODE_READY','NODE_ERROR']);
 assert.deepEqual(events.map(x=>x.meta.level),[30,50]);
 assert.equal(events[0].event.sanitizedContext.backend,'nodelink');
 assert.doesNotMatch(JSON.stringify(events),/PRIVATE_/);
});
test('canonical route is exclusive and manager shutdown removes subscriptions', async t=>{
 const {createPlayer}=require('./helpers/player.cjs');
 const {manager,player}=createPlayer(t);const records=[];
 const target=Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(l=>[l,event=>records.push(event)]));
 const route=new AuroraEvents({level:'debug',target});route.attach(manager);
 const duplicate=new AuroraEvents({level:'debug',target});
 assert.throws(()=>duplicate.attach(manager),/already has a logging route/);
 manager.emit('trackStart',player,null);await manager.shutdown();manager.emit('trackStart',player,null);
 assert.equal(records.filter(r=>r.eventCode==='TRACK_STARTED').length,1);
 duplicate.close();
});
test('removed logger and transport exports cannot instantiate parallel engines',()=>{
 const api=require('../dist');
 for(const name of ['Logger','ConsoleReporter','createPinoSink','JsonLogTransport','PinoLogTransport','OpenTelemetryLogTransport','formatPlayerTrace'])
   assert.equal(Object.hasOwn(api,name),false,name);
});
