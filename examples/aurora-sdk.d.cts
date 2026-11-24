import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
export function createHostSDK(options?:{spanProcessor?:SpanProcessor;endpoint?:string;automaticCorrelation?:boolean;exportLogs?:boolean}):{start():void;emitAuroraEvent(event:unknown):boolean;close():Promise<void>};
