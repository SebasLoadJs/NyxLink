const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {BackendDetector}=require('../dist');
const {createPlayer}=require('./helpers/player.cjs');
const admin={allowSensitive:true,allowLoopbackHttp:true};
async function setup(t, handler){
  const {node}=createPlayer(t),calls=[];
  const server=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;calls.push({method:req.method,url:req.url,body});handler(req,res);});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  node.port=server.address().port;
  node.backend=BackendDetector.detect({version:{semver:'4.2.2'},plugins:[{name:'youtube-plugin',version:'1.0.0'}]});
  return {node,calls};
}
const json=(res,v)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(v));};
test('YouTube plugin administrative requests are explicit and distinct from NodeLink',async t=>{
 const {node,calls}=await setup(t,(req,res)=>{
  if(req.method==='POST'){res.writeHead(204);res.end();}
  else if(req.url.startsWith('/youtube/oauth/')){res.writeHead(200,{'content-type':'text/plain'});res.end(JSON.stringify({access_token:'fixture-access',expires_in:3600,scope:'test',token_type:'Bearer'}));}
  else json(res,{refreshToken:null});
 });
 await assert.rejects(node.rest.getLavalinkYoutubeConfig({allowSensitive:true}),/HTTPS/);
 assert.deepEqual(await node.rest.getLavalinkYoutubeConfig(admin),{refreshToken:null});
 await assert.rejects(node.rest.updateLavalinkYoutubeConfig({refreshToken:'fixture'},admin),/Specify both/);
 await node.rest.updateLavalinkYoutubeConfig({refreshToken:'fixture',poToken:null,visitorData:null},admin);
 assert.equal((await node.rest.exchangeLavalinkYoutubeOAuth('fixture/token',admin)).access_token,'fixture-access');
 assert.deepEqual(calls.map(x=>[x.method,x.url]),[['GET','/youtube'],['POST','/youtube'],['GET','/youtube/oauth/fixture%2Ftoken']]);
 assert.deepEqual(JSON.parse(calls[1].body),{refreshToken:'fixture',poToken:null,visitorData:null});
});
test('YouTube admin errors never expose remote token bodies',async t=>{
 const {node}=await setup(t,(_req,res)=>{res.writeHead(401,{'content-type':'application/json'});res.end('{"message":"secret-fixture"}');});
 await assert.rejects(node.rest.exchangeLavalinkYoutubeOAuth('secret-fixture',admin),e=>e.statusCode===401&&!JSON.stringify(e).includes('secret-fixture')&&!String(e).includes('secret-fixture'));
});
test('YouTube source stream validates original-media transport and plugin presence',async t=>{
 const {node,calls}=await setup(t,(_req,res)=>{res.writeHead(200,{'content-type':'audio/webm'});res.end('fixture');});
 await assert.rejects(node.rest.loadLavalinkYoutubeStream('../info'),TypeError);
 const response=await node.rest.loadLavalinkYoutubeStream('abcdefghijk',{itag:251,withClient:'WEB'});
 let output='';for await(const chunk of response.stream)output+=chunk;
 assert.equal(output,'fixture');assert.equal(calls[0].url,'/youtube/stream/abcdefghijk?itag=251&withClient=WEB');
 node.backend=BackendDetector.detect({version:{semver:'4.2.2'},sourceManagers:['youtube']});
 await assert.rejects(node.rest.loadLavalinkYoutubeStream('abcdefghijk'),{code:'FEATURE_UNAVAILABLE'});
});
