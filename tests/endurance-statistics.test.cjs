const test=require('node:test');
const assert=require('node:assert/strict');
const {EnduranceLatency}=require('../scripts/endurance-statistics.cjs');
test('bounded HDR latency accumulator reports all observations without storing individual samples',()=>{
 const stats=new EnduranceLatency();
 assert.deepEqual(stats.summary(),{count:0,p50Ms:null,p95Ms:null,maxMs:null});
 for(let i=0;i<300000;i++)stats.record(i%100+1);
 const result=stats.summary();assert.equal(result.count,300000);assert.ok(Math.abs(result.p50Ms-50)<0.1);assert.ok(Math.abs(result.p95Ms-95)<0.2);assert.equal(result.maxMs,100);
 for(const invalid of [NaN,Infinity,-1,3600001])assert.throws(()=>stats.record(invalid),RangeError);
 assert.equal(stats.summary().count,300000);
});
