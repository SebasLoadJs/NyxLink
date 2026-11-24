import pino from 'pino';
import { prettyFactory } from 'pino-pretty';
import { createConsola } from 'consola';
import boxen from 'boxen';
import prettyMs from 'pretty-ms';
import { TerminalCoordinator, AuroraIncidentEngine, auroraCatalog } from 'nyxlink';
import { createPresentation } from './aurora-visual.mjs';
import { startCoordinatedMusicView } from './aurora-diagnostics.mjs';

const levels = ['trace','debug','info','warn','error','fatal'];
const rank = Object.fromEntries(levels.map((x,i)=>[x,i]));
const noOutput = Object.fromEntries(levels.map(x=>[x,()=>{}]));
const isCritical = record => record.severity === 'error' || record.severity === 'fatal';
function canonical(record) {
    if (!record || typeof record.eventCode !== 'string' || !Object.hasOwn(auroraCatalog,record.eventCode)) return undefined;
    const definition = auroraCatalog[record.eventCode];
    const safe = {
        eventCode:record.eventCode,category:definition.category,severity:definition.level,outcome:definition.outcome,
        timestamp:typeof record.timestamp==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.timestamp)?record.timestamp:new Date().toISOString(),
        sanitizedContext:{backend:['lavalink','nodelink'].includes(record.sanitizedContext?.backend)?record.sanitizedContext.backend:'unknown'},
    };
    for(const key of ['attempt','trackCount']){
        const value=record.sanitizedContext?.[key];
        if(Number.isSafeInteger(value)&&value>=0)safe.sanitizedContext[key]=value;
    }
    if(typeof record.durationMs==='number'&&Number.isFinite(record.durationMs)&&record.durationMs>=0)safe.durationMs=record.durationMs;
    if(typeof record.operationId==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(record.operationId))safe.operationId=record.operationId;
    const traceId=record.traceId??record.trace_id, spanId=record.spanId??record.span_id;
    if(typeof traceId==='string'&&/^[a-f0-9]{32}$/.test(traceId)&&!/^0+$/.test(traceId)&&typeof spanId==='string'&&/^[a-f0-9]{16}$/.test(spanId)&&!/^0+$/.test(spanId)){
        safe.traceId=traceId;safe.spanId=spanId;
    }
    return safe;
}
export function createAuroraPipeline(options={}){
    const format=options.format??'silent';
    if(!['silent','json','pretty','aurora','custom'].includes(format))throw new TypeError('Invalid Aurora format');
    const level=options.level??(format==='silent'?'silent':'info');
    if(level!=='silent'&&!Object.hasOwn(rank,level))throw new TypeError('Invalid Aurora level');
    if(format==='silent'||level==='silent')return {target:noOutput,level:'silent',banner:()=>{},close:async()=>true};
    if(format==='custom'){
        if(!options.target||levels.some(l=>typeof options.target[l]!=='function'))throw new TypeError('Custom requires a target');
        return {target:options.target,level,banner:()=>{},close:async()=>true};
    }
    const stream=options.stream??process.stdout;
    const width=()=>Math.max(40,Math.min(120,stream.columns??80));
    const interactive=format==='aurora'&&stream.isTTY===true&&!process.env.CI&&!('NO_COLOR'in process.env)&&process.env.TERM!=='dumb';
    const color=interactive&&options.color!==false;
    const terminal=new TerminalCoordinator({stream,interactive,color,maxQueued:options.maxQueued,onRejected:options.onRejected,onCriticalRejected:options.onCriticalRejected});
    let cachedWidth, cachedPresentation;
    const presentation=()=>{
        const columns=width();
        if(cachedWidth!==columns){
            cachedWidth=columns;
            cachedPresentation=createPresentation({columns,isTTY:interactive,color,unicode:options.unicode!==false});
        }
        return cachedPresentation;
    };
    let musicStop,closing=false;
    const pretty=prettyFactory({colorize:false,translateTime:'SYS:HH:MM:ss',ignore:'pid,hostname,timestamp,sanitizedContext,operationId,traceId,spanId,eventCode,outcome,severity',singleLine:true});
    const incidents=new AuroraIncidentEngine(options.incidentCapacity??100);
    let bannerWritten=false;
    const write=(line,record)=>terminal.write(line,isCritical(record)?'critical':'normal');
    const renderRecord=record=>{
        const incident=incidents.accept(record);
        if(!incident&&record.operationId&&record.eventCode.startsWith('FAILOVER_')&&incidents.snapshot().some(x=>x.operationId===record.operationId))return;
        if(incident&&incident.state!=='recovering'){
            const content=['FAILOVER '+incident.state.toUpperCase(),incident.sourceBackend?incident.sourceBackend.toUpperCase()+' -> '+incident.backend.toUpperCase():incident.backend.toUpperCase(),
                incident.durationMs===undefined?'Duration: N/A':'Duration: '+prettyMs(incident.durationMs)].join('\n');
            if(width()>=40&&options.unicode!==false)write(boxen(content,{padding:1,borderStyle:'round'}),record);
            else write(content,record);
            return;
        }
        if(isCritical(record)||options.detail===true){
            const definition=auroraCatalog[record.eventCode];
            write(String(pretty(JSON.stringify({...record,level:(rank[record.severity]+1)*10,msg:definition.message,time:Date.parse(record.timestamp)}))).trimEnd(),record);
        }else write(presentation().event(record),record);
    };
    // Consola is a reporter bridge, never a second terminal destination.
    const reporter=createConsola({level:5,throttle:0,reporters:[{log(log){renderRecord(log.args[0]);}}]});
    const logger=pino({level,base:null,redact:['password','token','authorization','sanitizedContext.password','sanitizedContext.token']},{
        write(line){
            try{
                const raw=JSON.parse(line);
                const record=canonical(raw);
                if(!record)return;
                try{options.onEvent?.({...record,sanitizedContext:{...record.sanitizedContext}});}catch{}
                if(format==='json')write(JSON.stringify({...record,level:raw.level,msg:auroraCatalog[record.eventCode].message}),record);
                else if(format==='pretty')write(String(pretty(JSON.stringify({...record,level:raw.level,msg:auroraCatalog[record.eventCode].message,time:raw.time}))).trimEnd(),record);
                else reporter.info(record);
            }catch{try{options.onRenderError?.();}catch{}}
        }
    });
    // The target exposes only the canonical event contract, not raw Pino APIs.
    const target=Object.fromEntries(levels.map(name=>[name,record=>{
        const safe=canonical(record);
        if(!safe||safe.severity!==name)return;
        logger[name](safe,auroraCatalog[safe.eventCode].message);
    }]));
    return {target,level,terminal,incidents,
        banner(manager){if(format==='aurora'&&!bannerWritten){bannerWritten=true;terminal.write(presentation().banner(manager));}},
        startMusic(strip,viewOptions={}){
            if(format!=='aurora'||closing)return ()=>{};
            musicStop?.();
            musicStop=startCoordinatedMusicView(strip,terminal,{...viewOptions,staticFallback:!interactive,onError:options.onRenderError});
            return musicStop;
        },
        close:signal=>{closing=true;musicStop?.();return terminal.close(signal);}};
}
