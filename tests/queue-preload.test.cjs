const test=require('node:test');
const assert=require('node:assert/strict');
const {NodeLinkAdapter}=require('../dist');
const {createPlayer,createTrack,deferred}=require('./helpers/player.cjs');
async function setup(t){
 const ctx=createPlayer(t);ctx.node.isNodeLink=true;ctx.node.backend=new NodeLinkAdapter('3.10.0',new Set(['nextTrack']));
 ctx.player.setAutoPlay(false);
 await ctx.player.play({track:createTrack('main')});
 await ctx.player.setCrossfade({enabled:true,mode:'smart'});
 ctx.player.current.position=160000;
 return ctx;
}
async function settle(player){for(let i=0;i<16&&player.preloadJob;i++)await player.preloadJob;assert.equal(player.preloadJob,undefined,'preload scheduler did not settle');}
test('scheduler reserves once without removing the queue head until confirmed handoff',async t=>{
 const ctx=await setup(t);const {player,node,requests}=ctx;
 const first=createTrack('next'),duplicate=createTrack('next');
 player.queue.add([first,duplicate]);
 player.setQueuePreload({enabled:true});
 for(let i=0;i<100;i++)player.requestQueuePreload();
 await settle(player);
 assert.deepEqual(player.queue.tracks,[first,duplicate]);
 const sent=requests.filter(x=>x.payload.nextTrack?.encoded===first.encoded);
 assert.equal(sent.length,1);
 await node.handleTrackStart(player,{track:{...first.toJSON(),userData:sent[0].payload.nextTrack.userData}});
 assert.equal(player.current.encoded,first.encoded);
 assert.deepEqual(player.queue.tracks,[duplicate]);
 assert.equal(player.previous.at(-1).encoded,'encoded-main');
 assert.equal(player.getNextTrack(),undefined);
 await settle(player);
});
test('queue reorder cancels and replaces an existing automatic reservation',async t=>{
 const {player,requests}=await setup(t);
 const a=createTrack('a'),b=createTrack('b');player.queue.add([a,b]);
 player.setQueuePreload({enabled:true});await settle(player);
 player.queue.swap(0,1);await settle(player);
 assert.deepEqual(requests.filter(x=>x.payload.nextTrack!==undefined).map(x=>x.payload.nextTrack?.encoded??null),[a.encoded,null,b.encoded]);
 assert.deepEqual(player.queue.tracks,[b,a]);
});
test('explicit skip clears automatic reservation instead of replaying it',async t=>{
 const {player,requests}=await setup(t);const next=createTrack('next');player.queue.add(next);
 player.setQueuePreload({enabled:true});await settle(player);
 assert.equal(await player.skip(),true);await settle(player);
 assert.equal(requests.findLast(x=>x.payload.track?.encoded===next.encoded).payload.nextTrack,null);
 assert.equal(player.getNextTrack(),undefined);assert.equal(player.queue.size,0);
});
test('manual preloads are not overwritten and disabling clears only automatic reservations',async t=>{
 const {player,requests}=await setup(t);
 await player.setNextTrack(createTrack('manual'));player.queue.add(createTrack('queued'));
 player.setQueuePreload({enabled:true});await settle(player);
 player.setQueuePreload({enabled:false});await settle(player);
 assert.equal(player.getNextTrack().encoded,'encoded-manual');
 assert.equal(requests.filter(x=>x.payload.nextTrack!==undefined).length,1);
});
test('stop cancels automatic preload and late events cannot promote it',async t=>{
 const {player,node,requests}=await setup(t);const next=createTrack('next');player.queue.add(next);
 player.setQueuePreload({enabled:true});await settle(player);
 const wire=requests.at(-1).payload.nextTrack;
 await player.stop();await settle(player);
 await node.handleTrackStart(player,{track:{...next.toJSON(),userData:wire.userData}});
 assert.equal(player.current,null);assert.deepEqual(player.queue.tracks,[next]);
});

test('queue reorder during an in-flight preload acknowledgment reconciles without a position tick',async t=>{
 const {player,node,requests}=await setup(t);
 const a=createTrack('a'),b=createTrack('b');player.queue.add([a,b]);
 const entered=deferred(),release=deferred();
 const original=node.rest.updatePlayer.bind(node.rest);
 let held=false;
 node.rest.updatePlayer=async (...args)=>{
   if(!held&&args[1].nextTrack?.encoded===a.encoded){
     held=true;entered.resolve();await release.promise;
   }
   return original(...args);
 };
 player.setQueuePreload({enabled:true});
 await entered.promise;
 player.queue.swap(0,1);
 release.resolve();
 await settle(player);
 assert.deepEqual(requests.filter(x=>x.payload.nextTrack!==undefined).map(x=>x.payload.nextTrack?.encoded??null),[a.encoded,null,b.encoded]);
 assert.deepEqual(player.queue.tracks,[b,a]);
 assert.equal(player.getNextTrack().encoded,b.encoded);
});

test('disabling crossfade clears the automatic remote preload without touching the queue',async t=>{
 const {player,requests}=await setup(t);
 const next=createTrack('next');player.queue.add(next);
 player.setQueuePreload({enabled:true});await settle(player);
 assert.equal(player.getNextTrack().encoded,next.encoded);
 await player.clearCrossfade();await settle(player);
 assert.equal(player.getCrossfade().enabled,false);
 assert.equal(player.getNextTrack(),undefined);
 assert.equal(requests.at(-1).payload.nextTrack,null);
 assert.deepEqual(player.queue.tracks,[next]);
});

test('enabling automatic preload after the crossfade is configured requires no extra position event',async t=>{
 const {player,requests}=await setup(t);
 const next=createTrack('next');player.queue.add(next);
 player.setQueuePreload({enabled:true});await settle(player);
 assert.equal(requests.filter(x=>x.payload.nextTrack?.encoded===next.encoded).length,1);
});
