const test=require('node:test');
const assert=require('node:assert/strict');
const {BackendDetector}=require('../dist');
const {createPlayer,deferred}=require('./helpers/player.cjs');
const {normalizeCrossfade}=require('../dist/src/backends/NodeLinkContracts');
function setup(node){node.isNodeLink=true;node.backend=BackendDetector.detect({version:{semver:'3.10.0'},isNodelink:true});}
test('crossfade accepts the current bounded wire options',()=>{
 const options={enabled:true,duration:5000,mode:'smart',curve:'sinusoidal',minBufferMs:250,bufferMs:0};
 assert.deepEqual(normalizeCrossfade(options),options);
 for(const patch of [{duration:30001},{minBufferMs:19},{bufferMs:NaN},{mode:'random'},{curve:'s-curve'},{enabled:'true'}])assert.throws(()=>normalizeCrossfade({...options,...patch}),TypeError);
});
test('crossfade controls reject Lavalink before attempting playback updates',async t=>{
 const {player,requests}=createPlayer(t);
 await assert.rejects(player.setCrossfade({enabled:true}),{code:'FEATURE_UNAVAILABLE'});
 await assert.rejects(player.updatePlayer({crossfade:{enabled:false}}),{code:'FEATURE_UNAVAILABLE'});
 assert.equal(requests.length,0);
});
test('crossfade commits only acknowledged state and returns detached configuration',async t=>{
 const {player,node,requests}=createPlayer(t);setup(node);
 const config={enabled:true,duration:5000,mode:'smart'};
 await player.setCrossfade(config);
 config.duration=1;
 assert.deepEqual(player.getCrossfade(),{enabled:true,duration:5000,mode:'smart'});
 player.getCrossfade().duration=2;
 assert.equal(player.getCrossfade().duration,5000);
 const original=node.rest.updatePlayer;
 node.rest.updatePlayer=async()=>{throw new Error('rejected');};
 await assert.rejects(player.clearCrossfade(),/rejected/);
 assert.equal(player.getCrossfade().enabled,true);
 node.rest.updatePlayer=original;
 await player.clearCrossfade();
 assert.deepEqual(requests.at(-1).payload,{crossfade:{enabled:false}});
 assert.equal(player.getCrossfade().enabled,false);
});
test('crossfade updates remain ordered across asynchronous acknowledgements',async t=>{
 const {player,node}=createPlayer(t);setup(node);
 const entered=deferred(),release=deferred();const calls=[];
 node.rest.updatePlayer=async(_guild,payload)=>{calls.push(payload.crossfade);if(calls.length===1){entered.resolve();await release.promise;}return payload;};
 const first=player.setCrossfade({enabled:true,duration:1000});await entered.promise;
 const second=player.clearCrossfade();
 assert.equal(player.getCrossfade(),undefined);assert.equal(calls.length,1);
 release.resolve();await Promise.all([first,second]);assert.deepEqual(calls,[{enabled:true,duration:1000},{enabled:false}]);
 assert.equal(player.getCrossfade().enabled,false);
});
