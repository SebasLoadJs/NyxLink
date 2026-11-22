const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('../dist/src/Util');

test('a once listener is consumed before a reentrant emission',()=>{
  const emitter=new EventEmitter();
  let calls=0;
  emitter.once('event',()=>{calls++; if(calls===1) emitter.emit('event');});
  emitter.emit('event');
  assert.equal(calls,1);
  assert.equal(emitter.listenerCount('event'),0);
});

test('a throwing once listener is consumed',()=>{
  const emitter=new EventEmitter();
  emitter.once('event',()=>{throw new Error('observer');});
  assert.throws(()=>emitter.emit('event'),/observer/);
  assert.doesNotThrow(()=>emitter.emit('event'));
  assert.equal(emitter.listenerCount('event'),0);
});

test('child emits reach the parent without local subscribers',()=>{
  const parent=new EventEmitter();
  const child=parent.createChild();
  const seen=[];
  parent.on('event', value=>seen.push(value));
  child.emit('event',42);
  assert.deepEqual(seen,[42]);
});

test('disposing a registration removes only that subscription',()=>{
  const emitter=new EventEmitter();
  let calls=0;
  const listener=()=>calls++;
  const disposeFirst=emitter.on('event',listener);
  const disposeSecond=emitter.on('event',listener);
  disposeFirst(); disposeFirst();
  emitter.emit('event');
  assert.equal(calls,1);
  disposeSecond();
  assert.equal(emitter.listenerCount('event'),0);
});

test('once cleanup preserves a new listener registered during the callback',()=>{
  const emitter=new EventEmitter();
  let calls=0;
  emitter.once('event',()=>{emitter.on('event',()=>calls++);});
  emitter.emit('event'); emitter.emit('event');
  assert.equal(calls,1);
});

test('prototype property names are usable event names',()=>{
  const emitter=new EventEmitter();
  let calls=0;
  emitter.on('constructor',()=>calls++);
  emitter.emit('constructor');
  assert.equal(calls,1);
});
