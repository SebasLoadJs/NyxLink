import { TerminalCoordinator } from 'nyxlink';
const terminal=new TerminalCoordinator({stream:process.stdout,interactive:true});
const lease=terminal.acquire();
if(!lease)throw new Error('Expected PTY region');
if(process.argv.includes('--resize')){
    // Keep stdin open until the PTY harness sends the completion key.
    process.stdin.resume();
    const done=new Promise(resolve=>process.stdin.once('data',resolve));
    lease.update('abcdefghijklmnopqrstuvwxyz');
    terminal.write('READY-TO-RESIZE');
    await done;
    process.stdin.pause();
}else lease.update('connecting');
terminal.write('PERSISTENT EVENT');
lease.release();
await terminal.close();
