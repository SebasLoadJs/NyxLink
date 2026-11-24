import type { InspectorSnapshot, InspectorSpan } from 'nyxlink';
import type { ReadStream, WriteStream } from 'node:tty';
export interface InspectorSource { snapshot(): InspectorSnapshot; sampleLatencies?(now?:number):void; latencyHistory?(alias:string):ReadonlyArray<{timeMs:number;latencyMs:number}>; }
export interface InspectorHandle { unmount():void; waitUntilExit():Promise<void>; }
export function startInspector(source: InspectorSource, options?: {stdout?:WriteStream;stdin?:ReadStream;reportPath?:string}): InspectorHandle|undefined;
export function traceRows(spans:InspectorSpan[],traceId:string,limit?:number):string[];
export function exportInspectorReport(source: InspectorSource, path:string):Promise<void>;
