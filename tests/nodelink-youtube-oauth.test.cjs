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
