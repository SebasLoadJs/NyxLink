const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {Manager}=require('../dist');
const {event}=require('../tests/helpers/v4-server.cjs');
const {matrixProfile,withLavalinkPluginLab,PluginLabFailure}=require('../tests/helpers/lavalink-plugin-lab.cjs');
const profileArg=process.argv[2];
const trackerCases={'xm-mod-http':'modHttp','xm-mod-local':'modLocal','xm-native':'xmHttp'};
const trackerCase=trackerCases[profileArg]??(profileArg==='xm'?'modHttp':undefined);
const id=trackerCase?'xm':profileArg;
(async()=>{
 const profile=matrixProfile(id);
 let report;const trackerObservations={};let trackerRuntime;
 try{
  const result=await withLavalinkPluginLab(async context=>{
   const manager=new Manager({nodes:[context.node],send(){throw Error('Discord intentionally unavailable');},options:{database:{type:'memory'},resume:false}});
   let stage='NODE_CONNECT';
   try{
    const ready=event(manager,'nodeReady',20000);
    await manager.init('823456789012345678');
    const [node]=await ready;
    stage='PLUGIN_METADATA';
    const installed=context.versions.at(-1);
    assert.equal(node.backend?.kind,'lavalink');
    const info=await node.rest.getBackendInfo();
    for(const expected of context.versions){
     const metadata=node.backend?.getPlugin(expected.name);
     assert.equal(metadata?.version,expected.version);
     assert.ok(info.plugins.some(p=>p.name.toLowerCase()===expected.name.toLowerCase()&&p.version===expected.version));
    }
    stage='WAV_LOAD';
    const load=await node.rest.loadTracks(context.mediaUrl);
    assert.equal(load?.loadType,'track');
    assert.equal(typeof load.data?.encoded,'string');
    const checks=['advertised exact plugin version','typed info inventory','local generated WAV load'];
    if(id==='xm'){
     stage='XM_LOAD';
     const classify=result=>result?.loadType==='track'?typeof result.data?.encoded==='string'?'TRACK':'INVALID_TRACK':['empty','error','playlist','search'].includes(result?.loadType)?result.loadType.toUpperCase():'UNKNOWN';
     const direct=async identifier=>{
      const response=await fetch('http://127.0.0.1:'+context.node.port+'/v4/loadtracks?'+new URLSearchParams({identifier}),{headers:{Authorization:context.node.password},signal:AbortSignal.timeout(12000),redirect:'error'});
      if(!response.ok)return 'HTTP_'+response.status;
      return classify(await response.json());
     };
     const observe=async(key,operation)=>{
      try{trackerObservations[key]=await operation();}
      catch(error){const code=error?.cause?.code??error?.code;trackerObservations[key]=error?.name==='TimeoutError'||error?.name==='AbortError'?'TIMEOUT':code==='INVALID_PROTOCOL_RESPONSE'?'INVALID_PROTOCOL':Number.isInteger(error?.statusCode)?'HTTP_'+error.statusCode:['ECONNREFUSED','ECONNRESET','EPIPE','UND_ERR_SOCKET','ETIMEDOUT'].includes(code)?code:'FAILED';}
      console.log(JSON.stringify({trackerProbe:key,result:trackerObservations[key]}));
     };
     // Independently measure the server first, so an SDK exception cannot
     // hide the native REST result. Never log payloads or arbitrary errors.
     const identifier={modHttp:context.moduleUrl,modLocal:context.moduleFile,xmHttp:context.xmUrl}[trackerCase];
     await observe(trackerCase+'Wire',()=>direct(identifier));
     const afterWire=await context.inspectRuntime();
     if(afterWire.status==='running') await observe(trackerCase+'Sdk',async()=>classify(await node.rest.loadTracks(identifier,{timeoutMs:15000,signal:AbortSignal.timeout(15000)})));
     else trackerObservations[trackerCase+'Sdk']='NOT_RUN_SERVER_EXITED';
     trackerRuntime=await context.inspectRuntime();
     if(Object.values(trackerObservations).some(value=>value!=='TRACK'))throw new PluginLabFailure('PLUGIN_XM_TRACKER_ACCEPTANCE_FAILED');
     checks.push('generated tracker fixture recognized through native REST and SDK: '+trackerCase);
    }
    if(id==='lavadspx'){
     stage='DSPX_FILTER_CONTRACT';
     assert.equal(node.backend.supports('lavadspx'),true);
     const guild='923456789012345678';
     try{
      const ack=await node.rest.updatePlayer(guild,{volume:0,paused:true,filters:{pluginFilters:{'high-pass':{cutoffFrequency:80}}}});
      assert.ok(ack);
     }finally{await node.rest.destroyPlayer(guild);}
     checks.push('LavaDSPX high-pass control acknowledged (not measured audio)');
    }
    if(id==='java-lyrics'||id==='lyrics-kt'){
     // A paused player without a track exercises the actual REST route
     // without contacting YouTube or Genius.
     stage='JAVA_CURRENT_TRACK';
     const guild='923456789012345678';
     await node.rest.updatePlayer(guild,{volume:0,paused:true});
     try {await assert.rejects(id==='java-lyrics'?node.rest.getCurrentJavaTimedLyrics(guild):node.rest.getCurrentLyricsKt(guild),e=>e.statusCode===400);}
     finally {await node.rest.destroyPlayer(guild);}
     checks.push('standalone lyrics current-track no-track response');
    }
    return {passed:true,plugin:installed,provenance:profile.plugins.at(-1).provenance??'release-or-mirror-digest',plugins:context.versions,jars:context.jars,image:context.image,checks,providersConfigured:false,providerPlaybackVerified:false,discordVoice:false};
   }catch(error){
    if(error instanceof PluginLabFailure)throw error;
    const status=Number.isInteger(error?.statusCode)&&error.statusCode>=400&&error.statusCode<=599?'_HTTP_'+error.statusCode:error?.code==='INVALID_PROTOCOL_RESPONSE'?'_INVALID_PROTOCOL':error?.code==='ERR_ASSERTION'?'_ASSERTION':'';
    throw new PluginLabFailure('PLUGIN_'+stage+status+'_FAILED');
   }finally{await manager.shutdown();}
  },profile);
  report={profile:profileArg,...result,...(id==='xm'?{trackerObservations,trackerRuntime}:{})};
 }catch(error){report={profile:profileArg,passed:false,errorCode:error instanceof PluginLabFailure?error.code:'PLUGIN_MATRIX_FAILED',...(id==='xm'?{trackerObservations,trackerRuntime}:{})};}
 const destination=path.resolve('.runtime/plugin-matrix',profileArg+'.json');
 await fs.mkdir(path.dirname(destination),{recursive:true,mode:0o700});
 await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
})().catch(()=>{console.error('Plugin matrix infrastructure failed');process.exitCode=1;});
