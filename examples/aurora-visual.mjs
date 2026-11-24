// Explicit visual entrypoint: the application owns all optional dependencies.
import figlet from 'figlet';
import gradient from 'gradient-string';
import chalk from 'chalk';
import boxen from 'boxen';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import prettyMs from 'pretty-ms';
import logSymbols from 'log-symbols';
import { AuroraPresentation } from 'nyxlink';

export function createPresentation(options = {}) {
    const colors = gradient(['#EC75FF', '#818CF8', '#36E7F2']);
    return new AuroraPresentation({
        figlet: (text, font) => figlet.textSync(text, { font }),
        gradient: text => colors.multiline(text),
        paint: (text, hex) => chalk.hex(hex)(text),
        box: (text, width) => boxen(text, { width, padding: { left: 1, right: 1, top: 0, bottom: 0 }, borderStyle: 'round' }),
        width: stringWidth,
        strip: stripAnsi,
        duration: ms => prettyMs(ms),
        symbols: logSymbols,
    }, options);
}

/** Incident presentation shares the Aurora palette, and uses only known evidence.
 * Keep the status label intact for monochrome, accessibility and PTY assertions.
 */
export function renderIncident(incident,{columns=80,color=false,unicode=true}={}){
    const width=Math.max(20,Math.min(120,columns));
    const enabled=color===true&&!process.env.CI&&!('NO_COLOR' in process.env)&&process.env.TERM!=='dumb';
    const paint=(text,hex)=>enabled?chalk.hex(hex)(text):text;
    const colors={recovered:'#55E9B6',degraded:'#FFC66A',failed:'#FF6D91',cancelled:'#94A3B8',recovering:'#36E7F2'};
    const state=['recovered','degraded','failed','cancelled','recovering'].includes(incident.state)?incident.state:'unknown';
    const status=colors[state]??'#94A3B8';
    const symbol=unicode?(state==='recovered'?logSymbols.success:state==='failed'?logSymbols.error:state==='degraded'?logSymbols.warning:logSymbols.info):(state==='recovered'?'+':state==='failed'?'x':'!');
    const backend=value=>value==='lavalink'?'LAVALINK':value==='nodelink'?'NODELINK':'UNKNOWN';
    const destination=backend(incident.backend);
    const route=incident.sourceBackend?backend(incident.sourceBackend)+(unicode?' → ':' -> ')+destination:destination;
    const duration=Number.isFinite(incident.durationMs)&&incident.durationMs>=0?prettyMs(incident.durationMs):'N/A';
    const evidence={
        'source-cleanup-failed':'Source cleanup failed',
        'intent-cancelled':'Playback intent changed',
        'restart-rejected':'Destination restart rejected',
        'migration-error':'Migration failed'
    }[incident.reasonCode];
    const header='FAILOVER '+state.toUpperCase();
    const rows=[paint(stripAnsi(symbol)+' '+header,status),paint(route,'#A78BFA'), 'Duration: '+paint(duration,'#36E7F2')];
    if(evidence)rows.push('Evidence: '+evidence);
    const content=rows.join('\n');
    if(!unicode||width<40)return enabled?content:stripAnsi(content);
    const box=boxen(content,{width:Math.min(width,60),padding:{left:1,right:1,top:0,bottom:0},borderStyle:'round',...(enabled?{borderColor:status}: {})});
    const result=box.split('\n').every(line=>stringWidth(stripAnsi(line))<=width)?box:content;
    return enabled?result:stripAnsi(result);
}
