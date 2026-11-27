// Discovery only: never load, extract, install or execute downloaded archives.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const manifest=require('../tests/integration/plugin-artifact-candidates.json');
const allowed=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','maven.lavalink.dev','jitpack.io']);
const limit=32*1024*1024;
class AuditError extends Error{constructor(code){super(code);this.code=code;}}
async function digest(input,expectedSize,fetcher=fetch){
 let url=new URL(input),response;
 const signal=AbortSignal.timeout(90000);
 for(let n=0;n<=3;n++){
  if(url.protocol!=='https:'||url.username||url.password||url.port||!allowed.has(url.hostname))throw new AuditError('REJECTED_ORIGIN');
  response=await fetcher(url.href,{redirect:'manual',signal});
  if(response.status<300||response.status>=400)break;
  const target=response.headers.get('location');await response.body?.cancel();
  if(!target||n===3)throw new AuditError('REJECTED_REDIRECT');
  url=new URL(target,url);
 }
 if(!response.ok||!response.body)throw new AuditError('HTTP_'+response.status);
 const advertised=response.headers.get('content-length');
 if(advertised!==null&&Number(advertised)>limit){await response.body.cancel();throw new AuditError('SIZE_LIMIT');}
 const reader=response.body.getReader();let size=0,header=Buffer.alloc(0);const hash=createHash('sha256');
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>limit)throw new AuditError('SIZE_LIMIT');
   if(header.length<4)header=Buffer.concat([header,Buffer.from(value.subarray(0,4-header.length))]);
   hash.update(value);
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(!header.equals(Buffer.from([80,75,3,4])))throw new AuditError('NOT_ZIP');
 if(expectedSize!==undefined&&size!==expectedSize)throw new AuditError('SIZE_MISMATCH');
 return {sha256:hash.digest('hex'),bytes:size};
}
async function observe(url,size){
 try{return {ok:true,...await digest(url,size)};}
 catch(error){return {ok:false,code:error instanceof AuditError?error.code:'FETCH_FAILED'};}
}
async function main(){
 const report=[];
 for(const item of manifest){
  const release=await observe(item.release,item.size);
  const mirror=item.mirror?await observe(item.mirror):null;
  report.push({id:item.id,assetId:item.assetId??null,release,mirror,
   matchingMirrors:!!(release.ok&&mirror?.ok&&release.sha256===mirror.sha256),
   approvedForExecution:false});
 }
 const result={purpose:'observed SHA-256 candidates, not execution authorization',report};
 const dir=path.resolve('.runtime/plugin-artifact-audit');
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(result));
 if(report.some(r=>!r.release.ok))process.exitCode=1;
}
if(require.main===module)main().catch(()=>{console.error('Artifact audit infrastructure failed');process.exitCode=1;});
module.exports={digest};
