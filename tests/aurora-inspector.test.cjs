const test = require('node:test');
const assert = require('node:assert/strict');
const { Manager, AuroraInspectorStore } = require('../dist');
test('inspector keeps bounded detached records, no raw messages or credentials', async () => {
    const m = new Manager({ nodes: [{ host: 'localhost', port: 2333, password: 'private-password', secure: false }] });
    const store = new AuroraInspectorStore(m, 2);
    try {
        assert.equal(store.recordEvent({ eventCode: 'constructor' }), false);
        assert.equal(store.recordEvent({ eventCode: 'NODE_READY', message: 'private-raw', sanitizedContext: { backend: 'nodelink', guildId: 'private-guild' } }), true);
        store.recordEvent({ eventCode: 'NODE_ERROR' });
        store.recordEvent({ eventCode: 'TRACK_STARTED' });
        const snapshot = store.snapshot();
        assert.equal(snapshot.source, 'live');
        assert.deepEqual(snapshot.events.map(x => x.code), ['NODE_ERROR', 'TRACK_STARTED']);
        assert.doesNotMatch(JSON.stringify(snapshot), /private-/);
        snapshot.events[0].message = 'changed';
        assert.notEqual(store.snapshot().events[0].message, 'changed');
        assert.deepEqual(snapshot.spans, []);
    } finally { await m.shutdown(); }
});
test('inspector accepts only valid completed span metadata and no attributes', async () => {
    const m = new Manager({ nodes: [{ host: 'localhost', port: 2333, password: 'fixture', secure: false }] });
    const store = new AuroraInspectorStore(m, 1);
    const span = { name: 'nyxlink.search', traceId: 'a'.repeat(32), spanId: 'b'.repeat(16),
        durationMs: 12, outcome: 'ok', attributes: { token: 'private-token' } };
    try {
        assert.equal(store.recordSpan({ ...span, name: 'private-query' }), false);
        assert.equal(store.recordSpan({ ...span, durationMs: NaN }), false);
        assert.equal(store.recordSpan(span), true);
        assert.equal(store.recordSpan({ ...span, spanId: 'c'.repeat(16), parentSpanId: span.spanId }), true);
        assert.equal(store.snapshot().spans.length, 1);
        assert.equal(store.snapshot().spans[0].parentSpanId, span.spanId);
        assert.doesNotMatch(JSON.stringify(store.snapshot()), /private-token/);
    } finally { await m.shutdown(); }
});

test('latency samples are bounded and detached, missing measurements are not synthesized', async()=>{
 const m=new Manager({nodes:[{host:'localhost',port:2333,password:'fixture',secure:false}]});
 const node={connected:true,destroyed:false,draining:false,latency:10};
 m.nodes.nodes.set('private-node',node);
 const store=new AuroraInspectorStore(m,2);
 try{
   for(let i=0;i<70;i++){node.latency=i;store.sampleLatencies(i);}
   const history=store.latencyHistory('NODE-01');
   assert.equal(history.length,60);assert.equal(history[0].latencyMs,10);
   history[0].latencyMs=10000;assert.equal(store.latencyHistory('NODE-01')[0].latencyMs,10);
   node.connected=false;store.sampleLatencies(100);assert.equal(store.latencyHistory('NODE-01').at(-1).timeMs,69);
   m.nodes.nodes.clear();store.sampleLatencies(101);assert.deepEqual(store.latencyHistory('NODE-01'),[]);
 }finally{m.nodes.nodes.clear();await m.shutdown();}
});
