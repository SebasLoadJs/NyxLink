import { prettyFactory } from 'pino-pretty';
import { createConsola } from 'consola';
import { TerminalCoordinator, AuroraIncidentEngine, auroraCatalog, createAuroraPinoEngine, normalizeAuroraEvent } from 'nyxlink';
import { createPresentation, renderIncident } from './aurora-visual.mjs';
import { startCoordinatedMusicView } from './aurora-diagnostics.mjs';
import { wrapRecord } from './aurora-terminal-tools.mjs';

const levels = ['trace','debug','info','warn','error','fatal'];
const rank = Object.fromEntries(levels.map((x,i)=>[x,i]));
const noOutput = Object.fromEntries(levels.map(x=>[x,()=>{}]));
const isCritical = record => record.severity === 'error' || record.severity === 'fatal';
const canonical = normalizeAuroraEvent;
// One engine construction and canonical serialization path for every active format.
function createCanonicalEngine(level,consume,onRenderError){
    const engine=createAuroraPinoEngine(level,(record,raw)=>{
        const safe=canonical(record);
        if(safe)consume(safe,raw);
    },onRenderError);
    const target=Object.fromEntries(levels.map(name=>[name,record=>{
        const safe=canonical(record);
        if(safe&&safe.severity===name)engine.target[name](safe,auroraCatalog[safe.eventCode].message);
    }]));
    return {target,close:()=>engine.close()};
}
export function createAuroraPipeline(options={}){
    const format=options.format??'silent';
    if(!['silent','json','pretty','aurora','custom'].includes(format))throw new TypeError('Invalid Aurora format');
    const level=options.level??(format==='silent'?'silent':'info');
    if(level!=='silent'&&!Object.hasOwn(rank,level))throw new TypeError('Invalid Aurora level');
    if(format==='silent'||level==='silent')return {target:noOutput,level:'silent',banner:()=>{},close:async()=>true};
    if(format==='custom'){
        if(!options.target||levels.some(l=>typeof options.target[l]!=='function'))throw new TypeError('Custom requires a target');
        const engine=createCanonicalEngine(level,record=>{
            try{options.onEvent?.({...record,sanitizedContext:{...record.sanitizedContext}});}catch{}
            options.target[record.severity](record,auroraCatalog[record.eventCode].message);
        },options.onRenderError);
        return {target:engine.target,level,banner:()=>{},close:async()=>{engine.close();return true;}};
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
    const pretty=prettyFactory({colorize:false,translateTime:'SYS:HH:MM:ss',ignore:'pid,hostname,category,timestamp,sanitizedContext,operationId,traceId,spanId,eventCode,outcome,severity',singleLine:true,messageFormat:'{category} | {msg}'});
    const incidents=new AuroraIncidentEngine(options.incidentCapacity??100);
    let bannerWritten=false;
    const write=(line,record)=>terminal.write(format==='aurora'?wrapRecord(line,width()):line,isCritical(record)?'critical':'normal');
    const renderRecord=record=>{
        const incident=incidents.accept(record);
        if(!incident&&record.operationId&&record.eventCode.startsWith('FAILOVER_')&&incidents.snapshot().some(x=>x.operationId===record.operationId))return;
        if(incident&&incident.state!=='recovering'){
            write(renderIncident(incident,{columns:width(),color,unicode:options.unicode!==false}),record);
            return;
        }
        if(isCritical(record)||options.detail===true){
            const definition=auroraCatalog[record.eventCode];
            write(String(pretty(JSON.stringify({...record,level:(rank[record.severity]+1)*10,msg:definition.message,time:Date.parse(record.timestamp)}))).trimEnd(),record);
        }else write(presentation().event(record),record);
    };
    // Consola is a reporter bridge, never a second terminal destination.
    const reporter=createConsola({level:5,throttle:0,reporters:[{log(log){renderRecord(log.args[0]);}}]});
    const engine=createCanonicalEngine(level,(record,raw)=>{
        try{options.onEvent?.({...record,sanitizedContext:{...record.sanitizedContext}});}catch{}
        if(format==='json')write(JSON.stringify({...record,level:raw.level,msg:auroraCatalog[record.eventCode].message}),record);
        else if(format==='pretty')write(String(pretty(JSON.stringify({...record,level:raw.level,msg:auroraCatalog[record.eventCode].message,time:raw.time}))).trimEnd(),record);
        else {
            const semantic=record.severity==='fatal'||record.severity==='error'?'error':record.severity==='warn'?'warn':record.outcome==='confirmed'?'success':record.outcome==='started'?'start':record.severity==='debug'||record.severity==='trace'?'debug':'info';
            reporter[semantic](record);
        }
    },options.onRenderError);
    const target=engine.target;
    return {target,level,terminal,incidents,
        banner(manager){if(format==='aurora'&&!bannerWritten){bannerWritten=true;terminal.write(presentation().banner(manager));}},
        startMusic(strip,viewOptions={}){
            if(format!=='aurora'||closing)return ()=>{};
            musicStop?.();
            musicStop=startCoordinatedMusicView(strip,terminal,{...viewOptions,staticFallback:!interactive,onError:options.onRenderError});
            return musicStop;
        },
        close:signal=>{closing=true;engine.close();musicStop?.();return terminal.close(signal);}};
}
