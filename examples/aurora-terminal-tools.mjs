import cliTruncate from 'cli-truncate';
import wrapAnsi from 'wrap-ansi';
import sliceAnsi from 'slice-ansi';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import isUnicodeSupported from 'is-unicode-supported';
import figures from 'figures';
import { sparkline, sparkBar } from '@crafter/charts';
import prettyMs from 'pretty-ms';

export const terminalUnicode = (requested=true) => requested!==false&&isUnicodeSupported();
export const fitLabel = (text,width) => cliTruncate(String(text),Math.max(1,Math.floor(width)));
export const wrapRecord = (text,width) => wrapAnsi(String(text),Math.max(1,Math.floor(width)),{hard:true,trim:false});
export const viewport = (text,start,width) => sliceAnsi(String(text),Math.max(0,start),Math.max(0,start)+Math.max(1,width));
export const measure = text => stringWidth(stripAnsi(text));
export const stateMarker = (ready,unicode=true) => unicode?(ready?figures.tick:figures.circle):(ready?'+':'.');
export function latencyChart(history,{width=24,unicode=true}={}){
    const count=Math.max(2,Math.min(60,Math.floor(width)));
    const values=history.slice(-count).map(s=>s.latencyMs);
    if(!values.length||values.some(v=>!Number.isFinite(v)||v<0))return 'N/A';
    if(values.length===1||!unicode)return values.map(v=>prettyMs(v)).slice(-3).join(' / ');
    return fitLabel(stripAnsi(sparkline(values)),count)+' '+prettyMs(values.at(-1));
}
export function readinessChart(ready,total,{width=12,unicode=true}={}){
    if(!Number.isSafeInteger(ready)||!Number.isSafeInteger(total)||total<=0||ready<0||ready>total)return 'N/A';
    const size=Math.max(3,Math.min(30,Math.floor(width)));
    if(!unicode){const n=Math.floor(ready/total*size);return '['+'='.repeat(n)+'-'.repeat(size-n)+']';}
    return stripAnsi(sparkBar(ready,total,{width:size,showPercent:false}));
}
