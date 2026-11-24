import React, { useEffect, useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';

const h = React.createElement;
const tabs = ['Overview','Nodes','Players','Events','Traces'];
const levels = ['all','trace','debug','info','warn','error','fatal'];
const categories = ['all','CORE','MANAGER','NODE','WEBSOCKET','REST','PLAYER','QUEUE','TRACK','SEARCH','FILTERS','AUTOPLAY','CROSSFADE','FAILOVER','HEALTH','PLUGIN','TELEMETRY','LAVALINK','NODELINK'];
const backends = ['all','lavalink','nodelink','unknown'];
const cycle = (values, value) => values[(values.indexOf(value) + 1) % values.length];
const ms = value => value === undefined ? 'N/A' : Math.round(value) + 'ms';
const short = id => id?.slice(0, 8) ?? '-';

export function Inspector({ source, initialTab = 'Overview', interactive = true }) {
    const { exit } = useApp();
    const [snapshot, setSnapshot] = useState(() => source.snapshot());
    const [tab, setTab] = useState(Math.max(0, tabs.indexOf(initialTab)));
    const [level, setLevel] = useState('all');
    const [category, setCategory] = useState('all');
    const [backend, setBackend] = useState('all');
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [paused, setPaused] = useState(false);
    const [cursor, setCursor] = useState(0);
    const [detail, setDetail] = useState(false);
    useEffect(() => {
        if (paused || !interactive) return;
        const timer = setInterval(() => { try { setSnapshot(source.snapshot()); } catch {} }, 500);
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
        if (searching) {
            if (key.escape || key.return) setSearching(false);
            else if (key.backspace || key.delete) setQuery(q => q.slice(0,-1));
            else if (!key.ctrl && !key.meta && /^[ -~]+$/.test(input)) setQuery(q => (q + input).slice(0,80));
            setCursor(0); return;
        }
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
    }, { isActive: interactive });
    const rows = [];
    if (tab === 0) {
        rows.push('Nodes: ' + snapshot.nodes.filter(n=>n.ready).length + '/' + snapshot.nodes.length + ' ready',
            'Players: ' + snapshot.players.length, 'Events retained: ' + snapshot.events.length,
            'Completed spans retained: ' + snapshot.spans.length);
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
                const children = snapshot.spans.filter(s => s.traceId === item.traceId && s.parentSpanId === item.spanId);
                for (const child of children.slice(0,5)) rows.push('  -> ' + child.name + ' ' + ms(child.durationMs));
            } else if (tab === 1) {
                rows.push('Memory bytes: ' + (item.memoryUsedBytes ?? 'N/A'));
                for (const feature of item.capabilities.slice(0,8)) rows.push(feature.feature + ': ' + feature.state + ' (' + feature.evidence + ')');
            } else if (tab === 3) rows.push(item.message, 'Trace: ' + (item.traceId ?? 'N/A'), 'Duration: ' + ms(item.durationMs));
        }
    }
    return h(Box,{flexDirection:'column'},
        h(Text,{bold:true}, 'NYXLINK INSPECTOR | ' + snapshot.source.toUpperCase() + (paused?' | PAUSED':'')),
        h(Text,{},tabs.map((name,i)=>i===tab?'['+name+']':name).join('  ')),
        h(Text,{},'Level: '+level+'  Category: '+category+'  Backend: '+backend),
        h(Text,{},'Search: '+query+(searching?'_':'')),
        ...rows.map((line,i)=>h(Text,{key:i},line)),
        h(Text,{dimColor:true},'Tab/arrows: navigate | Enter: detail | p: pause | f/c/b: filters | /: search | q: quit')
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
    return render(h(Inspector,{source}),{stdout,stdin,patchConsole:false});
}
