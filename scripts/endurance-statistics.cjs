'use strict';
const {createHistogram}=require('node:perf_hooks');
// Fixed-memory histogram, with three significant figures. Convert ms to positive ns.
class EnduranceLatency {
  #histogram=createHistogram({lowest:1,highest:3600_000_000_000,figures:3});
  #max=0;
  record(ms){
    if(!Number.isFinite(ms)||ms<0||ms>3600000)throw new RangeError('Invalid endurance latency');
    this.#histogram.record(Math.max(1,Math.round(ms*1e6)));
    this.#max=Math.max(this.#max,ms);
  }
  summary(){
    const h=this.#histogram;
    return {count:h.count,p50Ms:h.count?h.percentile(50)/1e6:null,p95Ms:h.count?h.percentile(95)/1e6:null,maxMs:h.count?this.#max:null};
  }
}
module.exports={EnduranceLatency};
