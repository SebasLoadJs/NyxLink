const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
// Isolate the Windows ConPTY native addon from the CI driver. A terminal's
// child must actually emit exit and pass every assertion before this worker
// may exit; the parent independently enforces its exit status and deadline.
if(process.platform==='win32' && !process.argv.includes('--conpty-worker')){
 const result=spawnSync(process.execPath,[__filename,'--conpty-worker'],{stdio:'inherit',timeout:130000,windowsHide:true});
 if(result.error){console.error('ConPTY worker failed: '+result.error.message);process.exitCode=1;}
 else if(result.status!==0){console.error('ConPTY worker did not exit successfully: '+String(result.status??result.signal));process.exitCode=1;}
 return;
}
const pty=require('node-pty');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const demo=path.join(root,'examples/aurora-demo.mjs');
async function session(args,{columns=80,noColor=false,steps=[]}={}){
 const env={...process.env,TERM:'xterm-256color'};
 for(const key of ['CI','NO_COLOR','FORCE_COLOR'])delete env[key];
 if(noColor)env.NO_COLOR='1';else env.FORCE_COLOR='1';
 const terminal=pty.spawn(process.execPath,[demo,...args],{name:'xterm-256color',cols:columns,rows:30,cwd:root,env});
 let output='',exited;
 const data=terminal.onData(chunk=>{output+=chunk;});
 const exit=terminal.onExit(event=>{exited=event;});
 const deadline=Date.now()+20000;
 const wait=async predicate=>{
  while(!predicate()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(predicate(),'PTY acceptance timed out: '+output.slice(-1000));
 };
 try{
  for(const [marker,key] of steps){await wait(()=>output.includes(marker));await new Promise(resolve=>setTimeout(resolve,100));terminal.write(key);}
  await wait(()=>exited!==undefined);
  assert.equal(exited.exitCode,0,output);
  assert.ok(output.length<2_000_000);
  assert.doesNotMatch(output,/PRIVATE_CANARY|private-password/);
  return output;
 }finally{data.dispose();exit.dispose();if(!exited)terminal.kill();}
}
(async()=>{
 for(const columns of [40,80,120]){
  const out=await session(['--scenario','failover'],{columns});
  assert.match(out,/SIMULATED AURORA DEMO/);
  assert.match(out,/FAILOVER RECOVERED/);
 }
 const plain=await session(['--scenario','startup'],{noColor:true});
 assert.match(plain,/Backend session ready/);
 const inspector=await session(['--format','silent','--inspector'],{steps:[['[Overview]','\t'],['[Nodes]','\t'],['[Players]','\t'],['[Events]','\t'],['[Traces]','q']]});
 assert.match(inspector,/PLAYER-01/);assert.match(inspector,/No completed spans supplied by host/);
 const message='Node PTY acceptance: 5 simulated terminal sessions passed on '+process.platform;
 if(process.platform==='win32'){
  // The native test dependency can retain handles after onExit and both
  // subscriptions are disposed (observed in CI). This is harness shutdown,
  // not a forced exit of the NyxLink demo under test.
  const resources=process.getActiveResourcesInfo().filter(name=>name!=='PipeWrap'&&name!=='TTYWrap');
  process.stdout.write(message+'; remaining harness resources: '+JSON.stringify(resources)+'\n',()=>process.exit(0));
 }else console.log(message);
})().catch(error=>{
 if(process.platform==='win32')process.stderr.write(String(error.message)+'\n',()=>process.exit(1));
 else {console.error(error.message);process.exitCode=1;}
});
