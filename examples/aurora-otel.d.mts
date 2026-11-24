import type { AuroraInspectorStore } from 'nyxlink';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
export function activeTraceContext():{traceId:string;spanId:string}|undefined;
export function createInspectorSpanProcessor(store:AuroraInspectorStore):SpanProcessor;
