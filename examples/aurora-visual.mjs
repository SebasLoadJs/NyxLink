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
