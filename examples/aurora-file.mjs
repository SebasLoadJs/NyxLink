import { createAuroraPinoEngine, normalizeAuroraEvent } from 'nyxlink';
import build from 'pino-abstract-transport';
import pino from 'pino';
import { once } from 'node:events';
import { openSync, closeSync } from 'node:fs';
import { finished } from 'node:stream/promises';

/** Explicit exclusive file output. No terminal, no second logger, no overwrite. */
export async function createAuroraFilePipeline(path,{level='info',maxQueued=256}={}) {
    if (!['trace','debug','info','warn','error','fatal'].includes(level)) throw new TypeError('Invalid log level');
    if (!Number.isSafeInteger(maxQueued)||maxQueued<1||maxQueued>10000) throw new RangeError('Invalid file queue capacity');
    const fd=openSync(path,'wx',0o600);
    let destination;
    try { destination=pino.destination({dest:fd,sync:false,minLength:0}); }
    catch(error){closeSync(fd);throw error;}
    let closed=false, failure, ioError, pending=0;
    let transport, consumed;
    destination.on('error',error=>{ioError??=error;failure??=error;transport?.destroy(error);});
    const outputClosed=once(destination,'close').catch(error=>{failure??=error;});
    transport=build(source=>{
        consumed=(async()=>{
            for await(const input of source){
                try{
                    const event=normalizeAuroraEvent(input);
                    if(!event)throw new Error('Invalid canonical record');
                    if(ioError)throw ioError;
                    if(!destination.write(JSON.stringify(event)+'\n')) await once(destination,'drain');
                }finally{pending--;}
            }
        })();
        return consumed;
    });
    transport.on('error',error=>{failure??=error;});
    const transportClosed=finished(transport).catch(error=>{failure??=error;});
    const engine=createAuroraPinoEngine(level,event=>{
        if(closed||failure)return;
        if(pending>=maxQueued){failure=new Error('Aurora file queue capacity exceeded');return;}
        pending++;
        transport.write(JSON.stringify(event)+'\n');
    },()=>{failure??=new Error('Aurora serialization failed');});
    let closing;
    return {level,target:engine.target,close(){
        if(closing)return closing;
        closed=true;engine.close();
        closing=(async()=>{
            transport.end();
            try{await consumed;}catch(error){failure??=error;}
            await transportClosed;
            if(ioError)destination.destroy();else destination.end();
            await outputClosed;
            if(failure)throw failure;
        })();
        return closing;
    }};
}
