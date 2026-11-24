import { TerminalCoordinator } from 'nyxlink';
const terminal=new TerminalCoordinator({stream:process.stdout,interactive:true});
const lease=terminal.acquire();
if(!lease)throw new Error('Expected PTY region');
lease.update('connecting');
terminal.write('PERSISTENT EVENT');
lease.release();
await terminal.close();
