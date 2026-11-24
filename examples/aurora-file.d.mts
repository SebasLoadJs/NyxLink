import type { AuroraLevel, AuroraPinoTarget } from 'nyxlink';
export function createAuroraFilePipeline(path:string,options?:{level?:AuroraLevel}):Promise<{level:AuroraLevel;target:AuroraPinoTarget;close():Promise<void>}>;
