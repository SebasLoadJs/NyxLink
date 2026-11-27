const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {BackendDetector}=require('../dist');
const {createPlayer}=require('./helpers/player.cjs');

test('NodeLink OAuth sends credentials only in POST body and strips remote errors',async t=>{
 const {node}=createPlayer(t),calls=[];
 let status=200;
 const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  calls.push({method:req.method,url:req.url,body});
  res.writeHead(status,{'content-type':'application/json',...(status===302?{location:'/other'}:{})});
  res.end(JSON.stringify(status===200?{access_token:'fixture-access',expires_in:3600}:{message:'fixture-private-token'}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 node.port=server.address().port;node.secure=false;
 node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});node.isNodeLink=true;
 await assert.rejects(node.rest.exchangeYoutubeOAuth('bad token'),TypeError);
 assert.deepEqual(await node.rest.exchangeYoutubeOAuth('fixture-private-token'),{access_token:'fixture-access',expires_in:3600});
 assert.deepEqual(calls,[{method:'POST',url:'/v4/youtube/oauth',body:'{"refreshToken":"fixture-private-token"}'}]);
 status=401;
 await assert.rejects(node.rest.exchangeYoutubeOAuth('fixture-private-token'),e=>e.statusCode===401&&!JSON.stringify(e).includes('fixture-private-token')&&!String(e).includes('fixture-private-token'));
 status=302;
 await assert.rejects(node.rest.exchangeYoutubeOAuth('fixture-private-token'),/request failed/);
 assert.equal(calls.length,3);
 node.backend=BackendDetector.detect({version:{semver:'4.2.2'}});node.isNodeLink=false;
 await assert.rejects(node.rest.exchangeYoutubeOAuth('fixture-private-token'),{code:'FEATURE_UNAVAILABLE'});
 assert.equal(calls.length,3);
});

test('typed OAuth projection validates known token fields and sanitizes cancellation',async t=>{
 const {node}=createPlayer(t);node.secure=false;node.isNodeLink=true;
 node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});
 let calls=0,body={access_token:'fixture',expires_in:3600,token_type:'Bearer',unknown:'omit'};
 const server=http.createServer(async(req,res)=>{for await(const _ of req){}calls++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body));});
 server.listen(0,'127.0.0.1');await once(server,'listening');node.port=server.address().port;
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 assert.deepEqual(await node.rest.exchangeNodeLinkYoutubeOAuth('fixture-refresh'),{access_token:'fixture',expires_in:3600,token_type:'Bearer'});
 body={access_token:'fixture',expires_in:-1};
 await assert.rejects(node.rest.exchangeNodeLinkYoutubeOAuth('fixture-refresh'),{code:'INVALID_PROTOCOL_RESPONSE'});
 const controller=new AbortController();controller.abort(new Error('fixture-private-token'));
 await assert.rejects(node.rest.exchangeNodeLinkYoutubeOAuth('fixture-refresh',{signal:controller.signal}),e=>/cancelled/.test(e.message)&&!e.message.includes('private-token'));
 assert.equal(calls,2);
});
