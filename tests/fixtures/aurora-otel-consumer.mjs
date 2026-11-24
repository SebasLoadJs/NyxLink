import assert from 'node:assert/strict';
import {context} from '@opentelemetry/api';
import {AsyncLocalStorageContextManager} from '@opentelemetry/context-async-hooks';
import {BasicTracerProvider} from '@opentelemetry/sdk-trace-base';
import pino from 'pino';
import {Manager,OpenTelemetry,AuroraInspectorStore} from 'nyxlink';
import {activeTraceContext,createInspectorSpanProcessor} from './aurora-otel.mjs';
const cm=new AsyncLocalStorageContextManager().enable();assert.equal(context.setGlobalContextManager(cm),true);
let store;const records=[];
const m=new Manager({nodes:[{host:'localhost',port:2333,password:'fixture',secure:false}],options:{aurora:{level:'info',target:pino({level:'info'},{write(line){const record=JSON.parse(line);records.push(record);store?.recordEvent(record);}}),traceContext:activeTraceContext}}});
store=new AuroraInspectorStore(m);
const provider=new BasicTracerProvider({spanProcessors:[createInspectorSpanProcessor(store)]});
const t=new OpenTelemetry(m,{tracer:provider.getTracer('fixture')});
try{await t.operation('nyxlink.failover',async()=>{await t.operation('nyxlink.rest',async()=>{m.emit('nodeReady',{backend:{kind:'nodelink'}},{token:'private-token'});return 1;});return 2;});
const spans=store.snapshot().spans,outer=spans.find(x=>x.name==='nyxlink.failover'),inner=spans.find(x=>x.name==='nyxlink.rest');
assert.ok(outer&&inner);assert.equal(inner.parentSpanId,outer.spanId);assert.equal(inner.traceId,outer.traceId);assert.equal(records.length,1);assert.equal(records[0].spanId,inner.spanId);assert.equal(store.snapshot().events[0].traceId,inner.traceId);assert.doesNotMatch(JSON.stringify(store.snapshot()),/private-token/);
}finally{t.close();await m.shutdown();await provider.shutdown();context.disable();cm.disable();}
