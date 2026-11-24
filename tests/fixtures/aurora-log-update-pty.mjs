import { startStandaloneMusicView } from './aurora-diagnostics.mjs';
let positionMs=1000;
const stop=startStandaloneMusicView({snapshot:()=>({state:'playing',positionMs,durationMs:10000,stream:false,estimated:false})});
process.stdin.resume();
try{
 await new Promise(resolve=>{process.stdin.on('data',chunk=>{if(String(chunk).includes('n'))positionMs=5000;if(String(chunk).includes('q'))resolve();});});
}finally{process.stdin.pause();stop();process.stdin.removeAllListeners('data');}
process.stdout.write('VIEW CLOSED\n');
