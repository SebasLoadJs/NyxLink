const test=require('node:test');
const assert=require('node:assert/strict');
const {NodeLinkAdapter}=require('../dist');
const {createPlayer,createTrack,deferred}=require('./helpers/player.cjs');
function setup(node){node.isNodeLink=true;node.backend=new NodeLinkAdapter('3.10.0',new Set(['nextTrack']));}
async function play(ctx,track){await ctx.player.play({track});const sent=ctx.requests.findLast(x=>x.payload.track?.encoded===track.encoded).payload.track;await ctx.node.handleTrackStart(ctx.player,{track:{...track.toJSON(),userData:sent.userData}});}
async function promote(ctx,track,wire){await ctx.node.handleTrackStart(ctx.player,{track:{...track.toJSON(),userData:structuredClone(wire.userData)}});}
test('consumed preload is not re-sent by the following ordinary play',async t=>{
 const ctx=createPlayer(t);setup(ctx.node);ctx.player.setAutoPlay(false);
 await play(ctx,createTrack('main'));
 const next=createTrack('next');await ctx.player.setNextTrack(next);
 const wire=ctx.requests.at(-1).payload.nextTrack;
 assert.equal(ctx.player.getNextTrack().encoded,next.encoded);
 await promote(ctx,next,wire);
 assert.equal(ctx.player.getNextTrack(),undefined);
 await play(ctx,createTrack('later'));
 assert.equal(ctx.requests.findLast(x=>x.payload.track?.encoded==='encoded-later').payload.nextTrack,undefined);
});
test('early TrackStart cannot be resurrected by its late preload acknowledgement',async t=>{
 const ctx=createPlayer(t);setup(ctx.node);await play(ctx,createTrack('main'));
 const entered=deferred(),release=deferred();const next=createTrack('early');
 ctx.node.rest.updatePlayer=async(_guild,payload)=>{entered.resolve(payload.nextTrack);await release.promise;return payload;};
 const updating=ctx.player.setNextTrack(next);
 const wire=await entered.promise;
 await promote(ctx,next,wire);release.resolve();await updating;
 assert.equal(ctx.player.current.encoded,next.encoded);assert.equal(ctx.player.getNextTrack(),undefined);
});
test('stop clears acknowledged nextTrack atomically',async t=>{
 const ctx=createPlayer(t);setup(ctx.node);await play(ctx,createTrack('main'));
 const next=createTrack('next');await ctx.player.setNextTrack(next);
 await ctx.player.stop();
 assert.equal(ctx.requests.at(-1).payload.track.encoded,null);
 assert.equal(ctx.requests.at(-1).payload.nextTrack,null);
 assert.equal(ctx.player.getNextTrack(),undefined);
});
test('raw nextTrack updates share the same acknowledgement and consumption lifecycle',async t=>{
 const ctx=createPlayer(t);setup(ctx.node);await play(ctx,createTrack('main'));
 const next=createTrack('raw');await ctx.player.updatePlayer({nextTrack:{encoded:next.encoded,userData:{custom:true}}});
 const copy=ctx.player.getNextTrack();copy.userData.custom=false;
 assert.equal(ctx.player.getNextTrack().userData.custom,true);
 await promote(ctx,next,ctx.requests.at(-1).payload.nextTrack);
 assert.equal(ctx.player.getNextTrack(),undefined);
});
