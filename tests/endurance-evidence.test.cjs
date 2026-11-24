const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectEndurance } = require('../scripts/check-endurance-evidence.cjs');
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
