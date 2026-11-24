const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {Manager,AuroraBootstrap,NodeState}=require('../dist');

test('startup is explicit and never claims readiness for an unconnected configured node',async()=>{
 const manager=new Manager({nodes:[{identifier:'node-a',host:'127.0.0.1',port:2333,password:'PRIVATE_PASSWORD'}]});
 const snapshots=[];
 const bootstrap=new AuroraBootstrap(manager,{timeoutMs:10,onSnapshot:s=>snapshots.push(s)});
 assert.equal(snapshots.length,0);
 const node={identifier:'node-a',connected:false,destroyed:false,state:NodeState.CONNECTING};
 manager.nodes.nodes.set(node.identifier,node);
 try {
   const observed=await bootstrap.observeNetwork();
   assert.equal(observed.phase,'timeout');assert.equal(observed.ready,0);assert.equal(observed.total,1);
   assert.deepEqual(snapshots.map(s=>s.phase),['connecting','timeout']);
   assert.doesNotMatch(JSON.stringify(snapshots),/PRIVATE_PASSWORD|HEALTHY|configuration.*validated/i);
 } finally {manager.nodes.nodes.clear();await manager.shutdown();}
});

test('startup presentation is plain in non-TTY and NO_COLOR, with JSON separate from terminal decoration',()=>{
 const source=`const {Manager,AuroraPresentation,createAuroraPinoEngine}=require('./dist');const m=new Manager({nodes:[{host:'127.0.0.1',port:2333,password:'fixture'}]});const opt=JSON.parse(process.argv[1]);const strip=s=>s.replace(/\\x1b\\[[0-9;]*m/g,'');const paint=s=>'\\x1b[38;2;1;2;3m'+s+'\\x1b[0m';const tools={figlet:s=>s,gradient:paint,paint,box:s=>s,width:s=>strip(s).length,strip,duration:n=>n+'ms',symbols:{info:'i',success:'+',warning:'!',error:'x'}};if(opt.json){const e=createAuroraPinoEngine('info',(record,meta)=>process.stdout.write(JSON.stringify({...record,level:meta.level})+'\\n'));e.target.info({eventCode:'MANAGER_INITIALIZED',sanitizedContext:{}},'ignored');e.close();}else{process.stdout.write(new AuroraPresentation(tools,opt).banner(m));}m.shutdown();`;
 function run(options,extraEnv={}){
   const env={...process.env};delete env.NO_COLOR;delete env.FORCE_COLOR;delete env.CI;delete env.TERM;
   const r=spawnSync(process.execPath,['-e',source,JSON.stringify(options)],{cwd:require('node:path').resolve(__dirname,'..'),env:{...env,...extraEnv},encoding:'utf8',timeout:10000});
   assert.equal(r.status,0,r.stderr);return r.stdout;
 }
 const plain=run({color:true,isTTY:false,unicode:false},{FORCE_COLOR:'3'});
 assert.match(plain,/NYXLINK/);assert.match(plain,/Backends/);assert.doesNotMatch(plain,/\\x1b\\[|fixture/);
 const color=run({color:true,isTTY:true},{FORCE_COLOR:'3'});
 assert.match(color,/\\x1b\\[38;2;/);
 assert.doesNotMatch(run({color:true,isTTY:true},{FORCE_COLOR:'3',NO_COLOR:''}),/\\x1b\\[/);
 const json=run({json:true},{FORCE_COLOR:'3'});
 assert.doesNotMatch(json,/\\x1b\\[/);assert.equal(JSON.parse(json).eventCode,'MANAGER_INITIALIZED');
});
