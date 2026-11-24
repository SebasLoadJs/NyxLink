const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectEndurance, inspectSoak, sourceRevision } = require('../scripts/check-endurance-evidence.cjs');
const revision = 'a'.repeat(40);
const sample = () => ({sourceRevision:revision,scope:'local backend endurance; no Discord voice or audible playback',passed:true,
 durationSeconds:600,elapsedSeconds:601,backends:['lavalink','nodelink'].map(backend=>({backend,version:'fixture',image:'fixture',cycles:300,resumes:1,pings:1})),
 cleanup:{players:0,nodes:0,activeResources:[]},samples:[{elapsedSeconds:0,heapUsedBytes:100,rssBytes:1000},{elapsedSeconds:600,heapUsedBytes:101,rssBytes:1000}]});
test('extended evidence is SHA bound and cannot approve release',()=>{
 const result=inspectEndurance(revision,sample());
 assert.equal(result.enduranceEvidenceComplete,true);
 assert.equal(result.releaseApproved,false);assert.equal(result.humanListeningRequired,true);
});
test('rejects stale, short, failed, single-backend and incomplete reports',()=>{
 for(const change of [
 {sourceRevision:'b'.repeat(40)},{durationSeconds:60},{elapsedSeconds:599},{passed:false},{error:'failure'},
 {backends:[sample().backends[0]]},{backends:[null,null]},{samples:[null,null]},{cleanup:{players:1,nodes:0,activeResources:[]}},
 {cleanup:{players:0,nodes:0,activeResources:['Timeout']}},{samples:[]}
 ])assert.equal(inspectEndurance(revision,{...sample(),...change}).enduranceEvidenceComplete,false);
 assert.equal(inspectEndurance(revision,null).enduranceEvidenceComplete,false);
});

test('source revision permits regenerated dist only, rejects dirty or untracked source',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {execFileSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nyxlink-endurance-revision-'));
 const git=(...args)=>execFileSync('git',args,{cwd:dir,stdio:'pipe'});
 try{
  git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  fs.mkdirSync(path.join(dir,'dist'));fs.writeFileSync(path.join(dir,'dist','index.js'),'old');
  fs.writeFileSync(path.join(dir,'index.ts'),'original');
  git('add','.');git('commit','-m','fixture');
  const sha=sourceRevision(dir);
  fs.writeFileSync(path.join(dir,'dist','index.js'),'rebuilt');
  fs.writeFileSync(path.join(dir,'dist','extra.js'),'generated');
  assert.equal(sourceRevision(dir),sha);
  fs.writeFileSync(path.join(dir,'index.ts'),'changed');
  assert.throws(()=>sourceRevision(dir),/clean checkout/);
  git('restore','index.ts');
  fs.writeFileSync(path.join(dir,'extra.ts'),'untracked');
  assert.throws(()=>sourceRevision(dir),/clean checkout/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('endurance evidence rejects truncated, reversed and out-of-range sampling',()=>{
 for(const samples of [
 [{elapsedSeconds:0,heapUsedBytes:100,rssBytes:1000},{elapsedSeconds:1,heapUsedBytes:100,rssBytes:1000}],
 [{elapsedSeconds:0,heapUsedBytes:100,rssBytes:1000},{elapsedSeconds:599,heapUsedBytes:100,rssBytes:1000},{elapsedSeconds:5,heapUsedBytes:100,rssBytes:1000},{elapsedSeconds:600,heapUsedBytes:100,rssBytes:1000}],
 [{elapsedSeconds:0,heapUsedBytes:100,rssBytes:1000},{elapsedSeconds:900,heapUsedBytes:100,rssBytes:1000}]
 ])assert.equal(inspectEndurance(revision,{...sample(),samples}).enduranceEvidenceComplete,false);
});
test('600 seconds cannot certify a 24-hour soak, complete synthetic schema can',()=>{
 assert.equal(inspectSoak(revision,sample(),24).soakEvidenceComplete,false);
 const report={...sample(),durationSeconds:86400,elapsedSeconds:86401,samplingEverySeconds:60,
 backends:sample().backends.map(b=>({...b,cycles:43200})),
 samples:[sample().samples[0],{elapsedSeconds:86400,heapUsedBytes:101,rssBytes:1000}]};
 assert.equal(inspectSoak(revision,report,24).soakEvidenceComplete,true);
 assert.equal(inspectSoak(revision,report,48).soakEvidenceComplete,false);
 assert.equal(inspectSoak(revision,{...report,samplingEverySeconds:10},24).soakEvidenceComplete,false);
 assert.equal(inspectSoak(revision,{...report,error:'failure'},24).soakEvidenceComplete,false);
 assert.equal(inspectSoak(revision,report,24).releaseApproved,false);
});
