import { parseArgs } from 'node:util';
import { Manager, AuroraInspectorStore } from 'nyxlink';
import { createAuroraPipeline } from './aurora-pipeline.mjs';
import { startInspector } from './aurora-inspector.mjs';
import { musicLine, capabilityTable } from './aurora-diagnostics.mjs';

const {values}=parseArgs({options:{format:{type:'string',default:'aurora'},scenario:{type:'string',default:'all'},snapshot:{type:'boolean',default:false},inspector:{type:'boolean',default:false}}});
const scenarios=['startup','music','failover','degraded','recovery-failed','burst','all'];
if(!scenarios.includes(values.scenario)||!['silent','json','pretty','aurora'].includes(values.format))throw new Error('Unsupported demo option');
const scenario=name=>values.scenario==='all'||values.scenario===name;
let store;
const pipeline=createAuroraPipeline({format:values.format,level:values.format==='silent'?'silent':'debug',color:!values.snapshot,onEvent:event=>store?.recordEvent(event)});
const manager=new Manager({nodes:[{identifier:'fixture',host:'localhost',port:2333,password:'fixture',secure:false}],options:{node:{autoMovePlayers:true},aurora:{target:pipeline.target,level:pipeline.level}}});
store=new AuroraInspectorStore(manager,200);
const nodeA={backend:{kind:'lavalink'}},nodeB={backend:{kind:'nodelink'}};
const player={node:nodeA};
const selected={state:'playing',positionMs:32000,durationMs:180000,estimated:false,stream:false};
const nodes=[{alias:'NODE-01',backend:'lavalink',ready:true,latencyMs:24,memoryUsedBytes:1048576,capabilities:[{feature:'tracks:load',state:'available',evidence:'protocol'}]},{alias:'NODE-02',backend:'nodelink',ready:false,capabilities:[]}];
try{
    // No Discord login, node connection, real playback or external service.
    if(values.format!=='silent'&&!values.inspector)process.stderr.write('SIMULATED AURORA DEMO: '+values.scenario+'\n');
    if(!values.inspector)pipeline.banner(manager);
    if(scenario('startup')){
        manager.emit('nodeReady',nodeA,{});
        manager.emit('nodeReady',nodeB,{});
    }
    if(scenario('music')){
        manager.emit('queueAdd',player,[{}]);
        manager.emit('trackStart',player,{});
        if(values.format==='aurora'&&!values.inspector)pipeline.terminal.write('SIMULATED '+musicLine(selected));
    }
    if(scenario('failover')){
        manager.emit('nodeDisconnect',nodeA,1006,'fixture');
        manager.emit('playerNodeFailover',player,{status:'in-progress'});
        player.node=nodeB;
        manager.emit('playerNodeFailover',player,{status:'recovered'});
    }
    if(scenario('degraded')){
        manager.emit('nodeReconnecting',nodeA,1);
        if(values.format==='aurora'&&!values.inspector)pipeline.terminal.write('SIMULATED CAPABILITIES\n'+capabilityTable(nodes));
    }
    if(scenario('recovery-failed')){
        manager.emit('playerNodeFailover',player,{status:'in-progress'});
        manager.emit('playerNodeFailover',player,{status:'failed'});
    }
    if(scenario('burst')){
        for(let i=0;i<50;i++)manager.emit('queueAdd',player,[{}]);
    }
    if(values.inspector){
        await pipeline.close();
        const source={snapshot:()=>({...store.snapshot(),source:'simulated',nodes,players:[{alias:'PLAYER-01',backend:'nodelink',state:'playing'}]})};
        const app=startInspector(source);
        if(app)await app.waitUntilExit();
    }
}finally{await manager.shutdown();await pipeline.close();}
