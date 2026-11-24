const assert = require('node:assert/strict');
const http = require('node:http');
const { createHostSDK } = require('./aurora-sdk.cjs');
const { trace, metrics } = require('@opentelemetry/api');

async function main() {
    const requests = [];
    const server = http.createServer((req,res)=>{
        let bytes=0;
        req.on('data',chunk=>bytes+=chunk.length);
        req.on('end',()=>{requests.push({path:req.url,bytes});res.writeHead(200,{'content-type':'application/json'});res.end('{}');});
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const sdk = createHostSDK({endpoint:'http://127.0.0.1:'+server.address().port,automaticCorrelation:true});
    try {
        sdk.start();
        // Require only after registration so instrumentation can patch the module.
        const pino = require('pino');
        const records=[];
        const logger=pino({base:null},{write(line){records.push(JSON.parse(line));}});
        const tracer=trace.getTracer('aurora-fixture');
        tracer.startActiveSpan('nyxlink.search',span=>{
            logger.info('fixture');
            span.end();
        });
        metrics.getMeter('aurora-fixture').createCounter('nyxlink.fixture').add(1);
        assert.equal(records.length,1);
        assert.match(records[0].trace_id,/^[a-f0-9]{32}$/);
        assert.match(records[0].span_id,/^[a-f0-9]{16}$/);
        await sdk.close();
        assert.ok(requests.some(r=>r.path==='/v1/traces'&&r.bytes>0));
        assert.ok(requests.some(r=>r.path==='/v1/metrics'&&r.bytes>0));
        assert.ok(requests.every(r=>r.path!=='/v1/logs'));
    } finally {
        try{await sdk.close();}finally{await new Promise(resolve=>server.close(resolve));}
    }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
