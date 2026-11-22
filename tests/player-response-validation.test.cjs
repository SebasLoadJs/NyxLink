const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {Rest}=require('../dist');
const {createPlayer,createTrack}=require('./helpers/player.cjs');
const {validatePlayerRead,validatePlayerAcknowledgement,validateSessionResponse}=require('../dist/src/backends/ProtocolValidation');
const guild='123456789012345678';
const row=()=>({guildId:guild,volume:100,paused:false,state:{position:0},track:null});

test('player reads reject incorrect ownership and invalid state',()=>{
  assert.doesNotThrow(()=>validatePlayerRead(row(),guild));
  assert.throws(()=>validatePlayerRead(row(),'223456789012345678'),{code:'INVALID_PROTOCOL_RESPONSE'});
  assert.throws(()=>validatePlayerRead({...row(),state:{position:-1}}),{code:'INVALID_PROTOCOL_RESPONSE'});
  assert.throws(()=>validatePlayerRead({...row(),track:{encoded:'bad'}}),{code:'INVALID_PROTOCOL_RESPONSE'});
  assert.doesNotThrow(()=>validatePlayerRead({...row(),track:createTrack('test').toJSON()}));
});
test('partial patch acknowledgements remain compatible but malformed fields fail',()=>{
  for(const value of [{},{volume:25},{track:{encoded:null}},{track:{encoded:'opaque'}}]) assert.doesNotThrow(()=>validatePlayerAcknowledgement(value,guild));
  for(const value of [true,[],{guildId:'wrong'},{paused:'false'},{volume:1001},{track:{}}]) assert.throws(()=>validatePlayerAcknowledgement(value,guild),{code:'INVALID_PROTOCOL_RESPONSE'});
});
test('session responses require explicit boolean and finite timeout',()=>{
  assert.doesNotThrow(()=>validateSessionResponse({resuming:true,timeout:60}));
  for(const value of [{},{resuming:'true',timeout:60},{resuming:true,timeout:-1}]) assert.throws(()=>validateSessionResponse(value),{code:'INVALID_PROTOCOL_RESPONSE'});
});
test('real REST rejects malformed player and session acknowledgements without triggering recovery',async t=>{
  const {node,player}=createPlayer(t);
  let body={guildId:'wrong',volume:10};let recoveries=0;
  player.softRestart=async()=>{recoveries++;return true;};
  const server=http.createServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(body));});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  node.port=server.address().port;node.sessionId='fixture-session';
  const rest=new Rest(node);
  await assert.rejects(rest.updatePlayer(guild,{volume:10}),{code:'INVALID_PROTOCOL_RESPONSE'});
  assert.equal(recoveries,0);
  body={...row(),guildId:'223456789012345678'};
  await assert.rejects(rest.getPlayer(guild),{code:'INVALID_PROTOCOL_RESPONSE'});
  body=[row(),{...row(),volume:-1}];
  await assert.rejects(rest.getPlayers(),{code:'INVALID_PROTOCOL_RESPONSE'});
  body={resuming:true};
  await assert.rejects(rest.updateSession(true,60),{code:'INVALID_PROTOCOL_RESPONSE'});
  body={resuming:true,timeout:60};
  assert.deepEqual(await rest.updateSession(true,60),body);
});
