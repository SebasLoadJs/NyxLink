const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {Manager}=require('../dist');
const {event}=require('../tests/helpers/v4-server.cjs');
const {matrixProfile,withLavalinkPluginLab,PluginLabFailure}=require('../tests/helpers/lavalink-plugin-lab.cjs');
const id=process.argv[2];
(async()=>{
 const profile=matrixProfile(id);
 let report;
 try{
  const result=await withLavalinkPluginLab(async context=>{
   const manager=new Manager({nodes:[context.node],send(){throw Error('Discord intentionally unavailable');},options:{database:{type:'memory'},resume:false}});
   try{
    const ready=event(manager,'nodeReady',20000);
    await manager.init('823456789012345678');
    const [node]=await ready;
    const installed=context.versions.at(-1);
    assert.equal(node.backend?.kind,'lavalink');
    const info=await node.rest.getBackendInfo();
    for(const expected of context.versions){
     const metadata=node.backend?.getPlugin(expected.name);
     assert.equal(metadata?.version,expected.version);
     assert.ok(info.plugins.some(p=>p.name.toLowerCase()===expected.name.toLowerCase()&&p.version===expected.version));
    }
    const load=await node.rest.loadTracks(context.mediaUrl);
    assert.equal(load?.loadType,'track');
    assert.equal(typeof load.data?.encoded,'string');
    const checks=['advertised exact plugin version','typed info inventory','local generated WAV load'];
    if(id==='xm'){
     const tracker=await node.rest.loadTracks(context.moduleUrl);
     assert.equal(tracker?.loadType,'track');
     assert.equal(typeof tracker.data?.encoded,'string');
     checks.push('generated ProTracker MOD recognized and encoded');
    }
    if(id==='java-lyrics'){
     // A paused player without a track exercises the actual REST route
     // without contacting YouTube or Genius.
     const guild='923456789012345678';
     await node.rest.updatePlayer(guild,{volume:0,paused:true});
     try {await assert.rejects(node.rest.getCurrentJavaTimedLyrics(guild),e=>e.statusCode===400);}
     finally {await node.rest.destroyPlayer(guild);}
     checks.push('standalone Java Timed Lyrics current-track no-track response');
    }
    return {passed:true,plugin:installed,plugins:context.versions,jars:context.jars,image:context.image,checks,providersConfigured:false,providerPlaybackVerified:false,discordVoice:false};
   }finally{await manager.shutdown();}
  },profile);
  report={profile:id,...result};
 }catch(error){report={profile:id,passed:false,errorCode:error instanceof PluginLabFailure?error.code:'PLUGIN_MATRIX_FAILED'};}
 const destination=path.resolve('.runtime/plugin-matrix',id+'.json');
 await fs.mkdir(path.dirname(destination),{recursive:true,mode:0o700});
 await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
})().catch(()=>{console.error('Plugin matrix infrastructure failed');process.exitCode=1;});
