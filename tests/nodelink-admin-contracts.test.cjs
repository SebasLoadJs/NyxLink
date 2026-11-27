const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),{once}=require('node:events');
const {BackendDetector}=require('../dist'),{createPlayer}=require('./helpers/player.cjs');
test('typed NodeLink administration validates configuration and worker identity on a fixture server',async t=>{
 const {node}=createPlayer(t),calls=[];
 let status=200,wrong=false;
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):null;
  calls.push({method:req.method,url:req.url,body});
  res.writeHead(status,{'content-type':'application/json'});
  res.end(JSON.stringify(status!==200?{message:'fixture-secret'}:req.url.startsWith('/v4/workers')?
    {killed:true,id:5,clusterId:wrong?2:1,pid:10}:req.method==='PATCH'?
    {message:'updated',workersUpdated:2,fieldsUpdated:Object.keys(body)}:
    {refreshToken:null,visitorData:'masked...',isConfigured:false,isValid:null}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 node.port=server.address().port;node.secure=false;
 node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});node.isNodeLink=true;
 const options={allowSensitive:true,allowLoopbackHttp:true};
 await assert.rejects(node.rest.getNodeLinkYoutubeConfig({allowSensitive:true}),/HTTPS/);
 assert.equal((await node.rest.getNodeLinkYoutubeConfig(options,true)).isConfigured,false);
 assert.throws(()=>node.rest.updateNodeLinkYoutubeConfig({},options),TypeError);
 assert.deepEqual(await node.rest.updateNodeLinkYoutubeConfig({visitorData:'fixture'},options),{workersUpdated:2,fieldsUpdated:['visitorData']});
 assert.throws(()=>node.rest.terminateNodeLinkWorker({id:5,clusterId:1},{...options,confirm:true,code:'fixture-secret'}),TypeError);
 assert.throws(()=>node.rest.terminateNodeLinkWorker({clusterId:1},{...options,confirm:false,code:'fixture-secret'}),TypeError);
 const termination={...options,confirm:true,code:'fixture-secret'};
 assert.deepEqual(await node.rest.terminateNodeLinkWorker({clusterId:1},termination),{killed:true,id:5,clusterId:1,pid:10});
 assert.deepEqual(calls.map(c=>[c.method,c.url]),[['GET','/v4/youtube/config?validate=true'],['PATCH','/v4/youtube/config'],['PATCH','/v4/workers']]);
 wrong=true;await assert.rejects(node.rest.terminateNodeLinkWorker({clusterId:1},termination),{code:'INVALID_PROTOCOL_RESPONSE'});
 status=403;await assert.rejects(node.rest.terminateNodeLinkWorker({clusterId:1},termination),e=>e.statusCode===403&&!JSON.stringify(e).includes('fixture-secret'));
});
