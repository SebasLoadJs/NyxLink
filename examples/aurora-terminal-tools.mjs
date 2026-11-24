import cliTruncate from 'cli-truncate';
import wrapAnsi from 'wrap-ansi';
import sliceAnsi from 'slice-ansi';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import isUnicodeSupported from 'is-unicode-supported';
import figures from 'figures';
import prettyMs from 'pretty-ms';
import ansiEscapes from 'ansi-escapes';
import terminalLink from 'terminal-link';
import supportsHyperlinks from 'supports-hyperlinks';
export const documentationUrl = 'https://github.com/SebasLoadJs/NyxLink/blob/dev/docs/aurora-installation.md';
export const canLink = (stream=process.stdout) => stream===process.stdout && stream.isTTY===true && supportsHyperlinks.stdout && !process.env.CI && !('NO_COLOR' in process.env) && process.env.TERM!=='dumb';
export const helpLink = (stream=process.stdout) => canLink(stream) ? terminalLink('Aurora documentation',documentationUrl,{fallback:false}) : 'Aurora documentation: '+documentationUrl;
// Used only by an explicitly owned, interactive terminal region.
export const clearHelpLine = (stream=process.stdout) => stream.isTTY===true && !process.env.CI && !('NO_COLOR' in process.env) && process.env.TERM!=='dumb' ? ansiEscapes.cursorLeft+ansiEscapes.eraseLine : '';

export const terminalUnicode = (requested=true) => requested!==false&&isUnicodeSupported();
export const fitLabel = (text,width) => cliTruncate(String(text),Math.max(1,Math.floor(width)));
export const wrapRecord = (text,width) => wrapAnsi(String(text),Math.max(1,Math.floor(width)),{hard:true,trim:false});
export const viewport = (text,start,width) => sliceAnsi(String(text),Math.max(0,start),Math.max(0,start)+Math.max(1,width));
export const measure = text => stringWidth(stripAnsi(text));
export const stateMarker = (ready,unicode=true) => unicode?(ready?figures.tick:figures.circle):(ready?'+':'.');
// Native, deterministic terminal charts; no runtime loader or external chart engine.
const boundedWidth = (width,min,max,fallback) => Number.isFinite(width)
    ? Math.max(min,Math.min(max,Math.floor(width))) : fallback;
const sparkGlyphs = '▁▂▃▄▅▆▇█';

export function latencyChart(history,{width=24,unicode=true}={}){
    const count=boundedWidth(width,2,60,24);
    const values=history.slice(-count).map(s=>s.latencyMs);
    if(!values.length||values.some(v=>!Number.isFinite(v)||v<0))return 'N/A';
    if(values.length===1||!unicode)return values.map(v=>prettyMs(v)).slice(-3).join(' / ');
    const low=Math.min(...values), high=Math.max(...values);
    const spark=values.map(value=>sparkGlyphs[high===low?3:Math.round((value-low)/(high-low)*7)]).join('');
    return spark+' '+prettyMs(values.at(-1));
}
export function readinessChart(ready,total,{width=12,unicode=true}={}){
    if(!Number.isSafeInteger(ready)||!Number.isSafeInteger(total)||total<=0||ready<0||ready>total)return 'N/A';
    const size=boundedWidth(width,3,30,12);
    if(!unicode){const n=Math.floor(ready/total*size);return '['+'='.repeat(n)+'-'.repeat(size-n)+']';}
    const filled=Math.floor(ready/total*size);
    return '█'.repeat(filled)+'░'.repeat(size-filled);
}
