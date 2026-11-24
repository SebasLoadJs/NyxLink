import type { CapabilityNode, MusicSnapshot, TerminalCoordinator, TerminalOptions } from 'nyxlink';
export function capabilityTable(nodes:CapabilityNode[]):string;
export function musicLine(snapshot:MusicSnapshot):string;
export function startStandaloneMusicView(strip:{snapshot():MusicSnapshot},options?:{stream?:TerminalOptions['stream']}):()=>void;
export function startCoordinatedMusicView(strip:{snapshot():MusicSnapshot},terminal:TerminalCoordinator,options?:{signal?:AbortSignal;intervalMs?:number;staticFallback?:boolean;onError?:()=>void}):()=>void;
