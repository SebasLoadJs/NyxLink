import type { AuroraLevel, AuroraPinoTarget } from 'nyxlink';
export function createAuroraFilePipeline(path:string,options?:{level?:AuroraLevel;maxQueued?:number}):Promise<{level:AuroraLevel;target:AuroraPinoTarget;close():Promise<void>}>;
