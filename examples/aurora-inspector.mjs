import React, { useEffect, useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import { writeFile } from 'node:fs/promises';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import prettyBytes from 'pretty-bytes';
import { latencyChart, readinessChart, fitLabel, viewport, terminalUnicode, stateMarker } from './aurora-terminal-tools.mjs';

/** Retained spans only; absent parents are not fabricated. Iterative traversal avoids cycles. */
export function traceRows(spans, traceId, limit=30){
    const nodes=spans.filter(s=>s.traceId===traceId).slice(0,10000);
    const known=new Set(nodes.map(s=>s.spanId));
    const children=new Map();
    const roots=[];
    for(const span of nodes){
        if(!span.parentSpanId||!known.has(span.parentSpanId))roots.push(span);
        else{const list=children.get(span.parentSpanId)??[];list.push(span);children.set(span.parentSpanId,list);}
    }
    const order=(a,b)=>(a.startTimeMs??Infinity)-(b.startTimeMs??Infinity)||a.spanId.localeCompare(b.spanId);
    const timed=nodes.filter(s=>Number.isFinite(s.startTimeMs));
    const origin=timed.length?Math.min(...timed.map(s=>s.startTimeMs)):undefined;
    const stack=roots.sort(order).reverse().map(span=>({span,depth:0}));
    const visited=new Set(),rows=[];
    while(rows.length<limit&&visited.size<nodes.length){
        if(!stack.length){const span=nodes.find(s=>!visited.has(s.spanId));if(!span)break;stack.push({span,depth:0});}
        const {span,depth}=stack.pop();if(visited.has(span.spanId))continue;visited.add(span.spanId);
        const offset=origin!==undefined&&Number.isFinite(span.startTimeMs)?'+'+Math.round(span.startTimeMs-origin)+'ms':'time N/A';
        rows.push('  '.repeat(Math.min(depth,5))+span.name+' '+offset+' / '+ms(span.durationMs)+(span.parentSpanId&&!known.has(span.parentSpanId)?' [parent not retained]':''));
        for(const child of (children.get(span.spanId)??[]).sort(order).reverse())stack.push({span:child,depth:depth+1});
    }
    return rows;
}

/** Explicit local export from the trusted read-only store, never overwrites. */
export async function exportInspectorReport(source,path){
    const snapshot=source.snapshot();
    await writeFile(path,JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),...snapshot},null,2)+'\n',{flag:'wx',mode:0o600});
}

const h = React.createElement;
const tabs = ['Overview','Nodes','Players','Events','Traces'];
const levels = ['all','trace','debug','info','warn','error','fatal'];
const categories = ['all','CORE','MANAGER','NODE','WEBSOCKET','REST','PLAYER','QUEUE','TRACK','SEARCH','FILTERS','AUTOPLAY','CROSSFADE','FAILOVER','HEALTH','PLUGIN','TELEMETRY','LAVALINK','NODELINK'];
const backends = ['all','lavalink','nodelink','unknown'];
const cycle = (values, value) => values[(values.indexOf(value) + 1) % values.length];
const ms = value => value === undefined ? 'N/A' : Math.round(value) + 'ms';
const short = id => id?.slice(0, 8) ?? '-';

export function Inspector({ source, initialTab = 'Overview', interactive = true, reportPath, columns=80, unicode=terminalUnicode() }) {
    const { exit } = useApp();
    const [snapshot, setSnapshot] = useState(() => source.snapshot());
    const [tab, setTab] = useState(Math.max(0, tabs.indexOf(initialTab)));
    const [level, setLevel] = useState('all');
    const [category, setCategory] = useState('all');
    const [backend, setBackend] = useState('all');
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [choosing,setChoosing]=useState(false);
    const [exporting,setExporting]=useState(false);
    const [paused, setPaused] = useState(false);
    const [cursor, setCursor] = useState(0);
    const [detail, setDetail] = useState(false);
    const [exportStatus,setExportStatus]=useState('');
    useEffect(() => {
        if (paused || !interactive) return;
        const timer = setInterval(() => { try { source.sampleLatencies?.(); setSnapshot(source.snapshot()); } catch {} }, 500);
        return () => clearInterval(timer);
    }, [source, paused, interactive]);
    const matches = item => JSON.stringify(item).toLowerCase().includes(query.toLowerCase());
    const nodes = snapshot.nodes.filter(n => (backend === 'all' || n.backend === backend) && matches(n));
    const players = snapshot.players.filter(p => (backend === 'all' || p.backend === backend) && matches(p));
    const events = snapshot.events.filter(e => (level === 'all' || e.level === level) &&
        (category === 'all' || e.category === category) && (backend === 'all' || e.backend === backend) && matches(e)).slice().reverse();
    const spans = snapshot.spans.filter(matches).slice().reverse();
    const items = [[], nodes, players, events, spans][tab];
    const selected = Math.min(cursor, Math.max(0, items.length - 1));
    useInput((input, key) => {
        if (searching || choosing) { if (key.escape) {setSearching(false);setChoosing(false);} return; }
        if (input === 'q' || (key.ctrl && input === 'c')) { exit(); return; }
        if (key.tab || key.rightArrow || key.leftArrow) {
            const delta = key.leftArrow || key.shift ? -1 : 1;
            setTab(t => (t + delta + tabs.length) % tabs.length); setCursor(0); setDetail(false);
        } else if (key.upArrow) setCursor(c => Math.max(0,c-1));
        else if (key.downArrow) setCursor(c => Math.min(Math.max(0,items.length-1),c+1));
        else if (key.return) setDetail(d => !d);
        else if (key.escape) setDetail(false);
        else if (input === 'p') setPaused(p => !p);
        else if (input === 'f') { setLevel(v => cycle(levels,v)); setCursor(0); }
        else if (input === 'c') { setCategory(v => cycle(categories,v)); setCursor(0); }
        else if (input === 'b') { setBackend(v => cycle(backends,v)); setCursor(0); }
        else if (input === '/') setSearching(true);
        else if (input === 'g') setChoosing(true);
        else if (input === 'e' && reportPath && !exporting) {
            setExporting(true);
            setExportStatus('Exporting...');
            exportInspectorReport(source,reportPath).then(()=>setExportStatus('Report saved'),()=>setExportStatus('Report export failed (file may already exist)')).finally(()=>setExporting(false));
        }
    }, { isActive: interactive });
    const rows = [];
    if (tab === 0) {
        rows.push('Nodes: ' + snapshot.nodes.filter(n=>n.ready).length + '/' + snapshot.nodes.length + ' ready',
            'Players: ' + snapshot.players.length, 'Events retained: ' + snapshot.events.length,
            'Completed spans retained: ' + snapshot.spans.length);
        rows.push('Network readiness: '+readinessChart(snapshot.nodes.filter(n=>n.ready).length,snapshot.nodes.length,{unicode}));
        for(const node of snapshot.nodes.slice(0,6))rows.push(stateMarker(node.ready,unicode)+' '+node.alias+' '+latencyChart(source.latencyHistory?.(node.alias)??[],{width:Math.min(24,Math.max(6,columns-20)),unicode}));
    } else {
        const from = Math.max(0, selected - 5);
        for (const [i, item] of items.slice(from,from+10).entries()) {
            const marker = from+i === selected ? '> ' : '  ';
            const value = tab === 1 ? item.alias + ' ' + item.backend + ' ' + (item.ready?'READY':'NOT READY') + ' ' + ms(item.latencyMs) :
                tab === 2 ? item.alias + ' ' + item.backend + ' ' + item.state :
                tab === 3 ? item.level.toUpperCase() + ' ' + item.code + ' ' + item.backend :
                item.name + ' ' + item.outcome + ' ' + ms(item.durationMs) + ' ' + short(item.spanId);
            rows.push(marker + value);
        }
        if (!items.length) rows.push(tab === 4 ? 'No completed spans supplied by host.' : 'No matching records.');
        if (detail && items[selected]) {
            const item = items[selected];
            if (tab === 4) {
                rows.push('Trace: ' + item.traceId, 'Span: ' + item.spanId,
                    'Parent: ' + (item.parentSpanId ?? 'root or unknown'));
                rows.push(...traceRows(snapshot.spans,item.traceId,8));
            } else if (tab === 1) {
                rows.push('Memory: ' + (Number.isFinite(item.memoryUsedBytes)&&item.memoryUsedBytes>=0?prettyBytes(item.memoryUsedBytes):'N/A'));
                const history=source.latencyHistory?.(item.alias)??[];
                if(history.length)rows.push('Latency samples: '+latencyChart(history,{width:Math.min(24,Math.max(6,columns-20)),unicode}));
                for (const feature of item.capabilities.slice(0,8)) rows.push(feature.feature + ': ' + feature.state + ' (' + feature.evidence + ')');
            } else if (tab === 3) rows.push(item.message, 'Trace: ' + (item.traceId ?? 'N/A'), 'Duration: ' + ms(item.durationMs));
        }
    }
    return h(Box,{flexDirection:'column'},
        h(Text,{bold:true,color:'#A78BFA'}, 'NYXLINK INSPECTOR | ' + snapshot.source.toUpperCase() + (paused?' | PAUSED':'')),
        h(Text,{color:'#36E7F2'},tabs.map((name,i)=>i===tab?'['+name+']':name).join('  ')),
        h(Text,{},'Level: '+level+'  Category: '+category+'  Backend: '+backend),
        searching?h(Box,{},h(Text,{},'Search: '),h(TextInput,{value:query,onChange:value=>{setQuery(value.replace(/[^ -~]/g,'').slice(0,80));setCursor(0);},onSubmit:()=>setSearching(false)})):h(Text,{},'Search: '+viewport(query,0,Math.max(1,columns-9))),
        ...(choosing?[h(SelectInput,{key:'jump',items:tabs.map((label,value)=>({label,value})),onSelect:item=>{setTab(item.value);setCursor(0);setDetail(false);setChoosing(false);}})]:[]),
        ...rows.map((line,i)=>h(Text,{key:i,color:line.startsWith('> ')?'#55E9B6':undefined},fitLabel(line,Math.max(10,columns-1)))),
        ...(exportStatus?[h(Text,{key:'export'},exporting&&interactive?h(Spinner,{type:'dots'}):null,exportStatus)]:[]),
        h(Text,{dimColor:true},'Tab/arrows: navigate | g: jump | Enter: detail | p: pause | f/c/b: filters | /: search | q: quit'+(reportPath?' | e: export':''))
    );
}
export function startInspector(source, options = {}) {
    const stdout = options.stdout ?? process.stdout;
    const stdin = options.stdin ?? process.stdin;
    if (!stdout.isTTY || !stdin.isTTY || process.env.CI || 'NO_COLOR' in process.env || process.env.TERM === 'dumb') {
        const snapshot = source.snapshot();
        stdout.write('NYXLINK INSPECTOR | '+snapshot.source.toUpperCase()+' | Nodes: '+snapshot.nodes.length+
            ' | Players: '+snapshot.players.length+' | Events: '+snapshot.events.length+' | Spans: '+snapshot.spans.length+'\n');
        return undefined;
    }
    // Explicit standalone mode. Do not run other stdout renderers beside Ink.
    return render(h(Inspector,{source,reportPath:options.reportPath,columns:stdout.columns??80}),{stdout,stdin,patchConsole:false});
}
