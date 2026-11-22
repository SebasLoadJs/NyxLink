const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {Rest,BackendDetector}=require('../dist');
const {createPlayer}=require('./helpers/player.cjs');
const guild='123456789012345678', other='223456789012345678';
const group={id:'radio',guildIds:[guild,other],createdAt:100};
const sponsor={enabled:true,categories:['sponsor'],actionTypes:['skip'],skipMarginMs:250,segments:[],lastSkippedUuid:null};
async function setup(t){
 const {node}=createPlayer(t);node.sessionId='session';node.isNodeLink=true;node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});
 const calls=[];let response={...group};let status=200;
 const server=http.createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;calls.push({method:req.method,path:req.url,body:body?JSON.parse(body):undefined});res.writeHead(status,{'content-type':'application/json'});res.end(status===204?'':JSON.stringify(response));});
 server.listen(0,'127.0.0.1');await once(server,'listening');node.port=server.address().port;
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 return {node,rest:new Rest(node),calls,respond:(v,s=200)=>{response=v;status=s;}};
}
test('groups use session-scoped routes and expose partial success without pretending all members succeeded',async t=>{
 const {rest,calls,respond}=await setup(t);
 await rest.createGroup({id:'radio',guildIds:[guild,other]});
 respond([group]);assert.deepEqual(await rest.getGroups(),[group]);
 respond(group);assert.deepEqual(await rest.getGroup('radio'),group);
 const result={...group,players:[{guildId:guild,volume:25,paused:false,state:{position:0},track:null}],errors:[{guildId:other,error:'Player failed'}]};
 respond(result);assert.deepEqual(await rest.updateGroup('radio',{volume:25}),result);
 respond(null,204);await rest.deleteGroup('radio');
 assert.deepEqual(calls.map(x=>[x.method,x.path]),[['POST','/v4/sessions/session/groups'],['GET','/v4/sessions/session/groups'],['GET','/v4/sessions/session/groups/radio'],['PATCH','/v4/sessions/session/groups/radio'],['DELETE','/v4/sessions/session/groups/radio']]);
 assert.deepEqual(calls[3].body,{volume:25});
});
test('group identity and invalid payloads are rejected without poisoning endpoint capability',async t=>{
 const {rest,node,calls,respond}=await setup(t);
 await assert.rejects(rest.updateGroup('radio',{volume:1001}),TypeError);
 await assert.rejects(rest.getGroup('../bad'),TypeError);
 await assert.rejects(rest.createGroup({id:'radio',guildIds:['bad']}),TypeError);
 assert.equal(calls.length,0);
 respond({...group,id:'different'});
 await assert.rejects(rest.getGroup('radio'),{code:'INVALID_PROTOCOL_RESPONSE'});
 assert.equal(node.backend.featureStatus('groups'),'unknown');
});
test('SponsorBlock supports settings, explicit segments and empty delete acknowledgements',async t=>{
 const {rest,calls,respond}=await setup(t);respond(sponsor);
 assert.deepEqual(await rest.getSponsorBlock(guild),sponsor);
 await rest.updateSponsorBlock(guild,{enabled:false,categories:['sponsor']});
 const segment={uuid:'test',start:1,end:2,category:'sponsor',actionType:'skip',votes:-1,locked:false,videoDuration:10,description:''};
 await rest.setSponsorBlockSegments(guild,[segment]);
 assert.deepEqual(calls[2].body,{segments:[segment]});
 await assert.rejects(rest.setSponsorBlockSegments(guild,[{...segment,end:0}]),TypeError);
 respond(null,204);await rest.clearSponsorBlock(guild);
 assert.deepEqual(calls.map(x=>x.method),['GET','PATCH','POST','DELETE']);
 assert.ok(calls.every(x=>x.path==='/v4/sessions/session/players/'+guild+'/sponsorblock'));
});
test('SponsorBlock validates responses and rejects unsupported backend operations',async t=>{
 const {rest,node,calls,respond}=await setup(t);
 respond({...sponsor,segments:[{}]});
 await assert.rejects(rest.getSponsorBlock(guild),{code:'INVALID_PROTOCOL_RESPONSE'});
 assert.equal(node.backend.featureStatus('sponsorblock'),'unknown');
 node.backend=BackendDetector.detect({version:{semver:'4.2.2'}});node.isNodeLink=false;
 await assert.rejects(rest.getSponsorBlock(guild),{code:'FEATURE_UNAVAILABLE'});
 await assert.rejects(rest.getGroups(),{code:'FEATURE_UNAVAILABLE'});
 assert.equal(calls.length,1);
});
