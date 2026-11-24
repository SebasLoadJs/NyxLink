import { TerminalCoordinator } from 'nyxlink';
const terminal=new TerminalCoordinator({stream:process.stdout,interactive:true});
const lease=terminal.acquire();
if(!lease)throw new Error('Expected PTY region');
if(process.argv.includes('--resize')){
    // Keep stdin open until the PTY harness sends the completion key.
    process.stdin.resume();
    const done=new Promise(resolve=>process.stdin.once('data',resolve));
    lease.update('abcdefghijklmnopqrstuvwxyz');
    const resized=()=>{if(process.stdout.columns===12)terminal.write('RESIZED');};
    process.stdout.on('resize',resized);
    terminal.write('READY-TO-RESIZE');
    try{await done;}finally{process.stdout.off('resize',resized);}
    process.stdin.pause();
}else lease.update('connecting');
terminal.write('PERSISTENT EVENT');
lease.release();
await terminal.close();
