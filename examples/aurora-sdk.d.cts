import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
export function createHostSDK(options?:{spanProcessor?:SpanProcessor;endpoint?:string;automaticCorrelation?:boolean}):{start():void;close():Promise<void>};
