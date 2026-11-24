import {context,trace} from '@opentelemetry/api';
// Host owns provider registration, context manager and shutdown.
export function activeTraceContext(){const span=trace.getSpan(context.active());if(!span)return undefined;const {traceId,spanId}=span.spanContext();return{traceId,spanId};}
export function createInspectorSpanProcessor(store){return{onStart(){},onEnd(span){try{const {traceId,spanId}=span.spanContext();const [seconds,nanos]=span.duration;store.recordSpan({name:span.name,traceId,spanId,parentSpanId:span.parentSpanContext?.spanId,durationMs:seconds*1000+nanos/1e6,outcome:span.status.code===2?'error':span.status.code===1?'ok':'unset'});}catch{}},forceFlush:async()=>{},shutdown:async()=>{}};}
