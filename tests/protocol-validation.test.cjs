const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {Rest,ProtocolResponseError}=require('../dist');
const {createPlayer,createTrack}=require('./helpers/player.cjs');
const {validateLoadResponse,validateTrackResponse}=require('../dist/src/backends/ProtocolValidation');
const valid=()=>createTrack('protocol').toJSON();

test('track validation preserves opaque encodings and tolerates omitted plugin metadata',()=>{
  const data=valid(); delete data.pluginInfo; delete data.userData;
  assert.doesNotThrow(()=>validateTrackResponse(data));
  assert.equal(data.encoded,'encoded-protocol');
  data.info.length=-1;
  assert.doesNotThrow(()=>validateTrackResponse(data));
});
test('invalid track metadata and arrays reject without exposing payload text',()=>{
  for(const info of [{length:NaN},{position:-1},{isStream:'false'},{uri:[]},{sourceName:null}]){
    const data=valid(); Object.assign(data.info,info); data.encoded='private-sentinel';
    assert.throws(()=>validateTrackResponse(data),error=>error instanceof ProtocolResponseError&&!error.message.includes('private-sentinel'));
  }
  assert.throws(()=>validateTrackResponse({...valid(),info:[]}),{code:'INVALID_PROTOCOL_RESPONSE'});
});
test('search payloads validate playlist shape and every track',()=>{
  assert.doesNotThrow(()=>validateLoadResponse({loadType:'playlist',data:{info:{name:'list',selectedTrack:-1},tracks:[valid()]}}));
  assert.throws(()=>validateLoadResponse({loadType:'playlist',data:{info:{name:'list'},tracks:[valid()]}}),{code:'INVALID_PROTOCOL_RESPONSE'});
  assert.throws(()=>validateLoadResponse({loadType:'search',data:[valid(),{encoded:'bad',info:{}}]}),{code:'INVALID_PROTOCOL_RESPONSE'});
  assert.doesNotThrow(()=>validateLoadResponse({loadType:'error',data:{message:'Unavailable'}}));
});
test('real HTTP load and decode methods reject malformed success responses',async t=>{
  const {node}=createPlayer(t);
  let body={loadType:'track',data:{encoded:'bad',info:{}}};
  const server=http.createServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(body));});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  node.port=server.address().port;
  const rest=new Rest(node);
  await assert.rejects(rest.loadTracks('test'),{code:'INVALID_PROTOCOL_RESPONSE'});
  body={encoded:'bad',info:{}};
  await assert.rejects(rest.decodeTrack('bad'),{code:'INVALID_PROTOCOL_RESPONSE'});
  body=[valid(),{encoded:'bad',info:{}}];
  await assert.rejects(rest.decodeTracks(['good','bad']),{code:'INVALID_PROTOCOL_RESPONSE'});
  body=[valid()];
  assert.equal((await rest.decodeTracks(['good']))[0].encoded,'encoded-protocol');
});
