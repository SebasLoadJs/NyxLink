import { createAuroraPinoEngine, normalizeAuroraEvent } from 'nyxlink';
import build from 'pino-abstract-transport';
import pino from 'pino';
import { once } from 'node:events';
import { openSync, closeSync } from 'node:fs';
import { finished } from 'node:stream/promises';

/** Explicit exclusive file output. No terminal, no second logger, no overwrite. */
export async function createAuroraFilePipeline(path,{level='info'}={}) {
    if (!['trace','debug','info','warn','error','fatal'].includes(level)) throw new TypeError('Invalid log level');
    const fd=openSync(path,'wx',0o600);
    let destination;
    try { destination=pino.destination({dest:fd,sync:false,minLength:0}); }
    catch(error){closeSync(fd);throw error;}
    let closed=false, failure;
    destination.on('error',error=>{failure??=error;});
    const outputClosed=once(destination,'close').catch(error=>{failure??=error;});
    const transport=build(async source=>{
        for await(const input of source){
            const event=normalizeAuroraEvent(input);
            if(!event)continue;
            if(failure)throw failure;
            if(!destination.write(JSON.stringify(event)+'\n')) await once(destination,'drain');
        }
    });
    transport.on('error',error=>{failure??=error;});
    const engine=createAuroraPinoEngine(level,event=>{
        if(!closed&&!failure) transport.write(JSON.stringify(event)+'\n');
    },()=>{failure??=new Error('Aurora serialization failed');});
    let closing;
    return {level,target:engine.target,close(){
        if(closing)return closing;
        closed=true;engine.close();
        closing=(async()=>{
            transport.end();
            try{await finished(transport);}catch(error){failure??=error;}
            destination.end();await outputClosed;
            if(failure)throw failure;
        })();
        return closing;
    }};
}
