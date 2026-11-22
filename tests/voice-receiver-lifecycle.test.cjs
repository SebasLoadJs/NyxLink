const test = require('node:test');
const assert = require('node:assert/strict');
const { VoiceReceiver } = require('../dist/src/entities/VoiceReceiver');
const { WebSocket } = require('../dist/src/services/WebSocket');
const { createPlayer } = require('./helpers/player.cjs');

function setup(t) {
  const {manager,node,player} = createPlayer(t);
  manager.clientId = '423456789012345678';
  node.isNodeLink = true;
  const sockets = [];
  t.mock.method(WebSocket.prototype, 'connectNode', function () {
    sockets.push(this);
    this.netSocket = { write() {}, destroy() {} };
    this.connected = true;
  });
  t.mock.timers.enable({apis:['setTimeout']});
  const receiver = new VoiceReceiver(node,player.guildId,{reconnectDelay:50});
  t.after(()=>receiver.close());
  return {receiver,sockets,node,player,manager};
}
test('duplicate connect does not allocate another socket',t=>{
  const {receiver,sockets}=setup(t);
  receiver.connect().connect();
  assert.equal(sockets.length,1);
});
test('explicit close cancels a delayed reconnect',t=>{
  const {receiver,sockets}=setup(t);
  receiver.connect();
  sockets[0].close(1006);
  assert.ok(receiver.reconnectTimer);
  receiver.close();
  assert.equal(receiver.reconnectTimer,undefined);
  t.mock.timers.tick(50);
  assert.equal(sockets.length,1);
});
test('node destruction closes a receiver and clears its retry timer',async t=>{
  const {receiver,sockets,node}=setup(t);
  receiver.connect();
  sockets[0].close(1006);
  await node.destroy();
  assert.equal(receiver.reconnectTimer,undefined);
  t.mock.timers.tick(50);
  assert.equal(sockets.length,1);
});
test('player destruction and migration close the old receiver',t=>{
  const {receiver,sockets,player,manager}=setup(t);
  receiver.connect();
  manager.emit('playerDestroyed',player);
  assert.equal(receiver.ws,undefined);
  receiver.connect();
  const previous=player.node;
  player.node={};
  manager.emit('playerSwitchedNode',player,previous,player.node);
  assert.equal(receiver.ws,undefined);
  assert.equal(receiver.reconnectTimer,undefined);
  assert.equal(sockets.length,2);
});
test('events from a replaced socket cannot deliver voice data or schedule a retry',t=>{
  const {receiver,sockets,player}=setup(t);
  let frames=0;
  receiver.on('data',()=>frames++);
  receiver.connect();
  const old=sockets[0];
  receiver.close();
  receiver.connect();
  const id=Buffer.from(player.guildId);
  const user=Buffer.from('323456789012345678');
  const frame=Buffer.concat([Buffer.from([3,0,id.length]),id,Buffer.from([user.length]),user,Buffer.alloc(8),Buffer.from([1])]);
  old.emit('message',{data:frame});
  old.emit('close',{code:1006,reason:'old'});
  assert.equal(frames,0);
  assert.equal(receiver.reconnectTimer,undefined);
  sockets[1].emit('message',{data:frame});
  assert.equal(frames,1);
});
