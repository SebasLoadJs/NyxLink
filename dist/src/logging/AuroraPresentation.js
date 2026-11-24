"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuroraPresentation = void 0;
const __1 = require("../..");
const AuroraEvents_1 = require("./AuroraEvents");
const severity = {
    trace: '#94A3B8', debug: '#818CF8', info: '#36E7F2',
    warn: '#FFC66A', error: '#FF6D91', fatal: '#FF6D91',
};
const semver = /^(?:\d+\.){2}\d+(?:[-+][0-9A-Za-z.-]+)?$/;
class AuroraPresentation {
    tools;
    columns;
    color;
    unicode;
    constructor(tools, options = {}) {
        this.tools = tools;
        const columns = options.columns ?? 80;
        if (!Number.isInteger(columns) || columns < 20 || columns > 1000)
            throw new RangeError('Invalid terminal width');
        this.columns = columns;
        this.color = options.color === true && options.isTTY === true &&
            !('NO_COLOR' in process.env) && !process.env.CI && process.env.TERM !== 'dumb';
        this.unicode = options.unicode !== false;
    }
    fits(text) {
        return text.split('\n').every(line => this.tools.width(this.tools.strip(line)) <= this.columns);
    }
    paint(text, color) {
        return this.color ? this.tools.paint(text, color) : text;
    }
    clean(text) {
        return this.color ? text : this.tools.strip(text);
    }
    banner(manager) {
        const word = 'NYXLINK';
        let title = word;
        if (this.unicode) {
            for (const font of ['ANSI Shadow', 'Slant', 'Small']) {
                const candidate = this.tools.figlet(word, font).trimEnd();
                if (candidate && this.fits(candidate)) {
                    title = candidate;
                    break;
                }
            }
        }
        const fields = [
            'Version   ' + (semver.test(__1.version) ? __1.version : 'Unknown'),
            'Backends  Lavalink + NodeLink',
            'Failover  ' + (manager.options.node?.autoMovePlayers === true ? 'Enabled' : 'Disabled'),
        ];
        const raw = fields.join('\n');
        const boxed = this.unicode ? this.tools.box(raw, Math.min(this.columns, 58)) : raw;
        const panel = this.fits(boxed) ? boxed : raw;
        const divider = (this.unicode ? '━' : '-').repeat(Math.min(this.columns, 58));
        const gradient = (text) => this.color ? this.tools.gradient(text) : text;
        return this.clean([gradient(title), this.paint('AUDIO WITHOUT BOUNDARIES', '#A78BFA'),
            gradient(divider), panel].join('\n'));
    }
    event(event) {
        if (!Object.hasOwn(AuroraEvents_1.auroraCatalog, event.eventCode))
            return '';
        const definition = AuroraEvents_1.auroraCatalog[event.eventCode];
        const symbol = definition.outcome === 'confirmed' ? 'success' :
            definition.level === 'error' ? 'error' :
                definition.level === 'warn' ? 'warning' : 'info';
        const fallback = { info: '>', success: '+', warning: '!', error: 'x' };
        const marker = this.unicode ? this.tools.symbols[symbol] : fallback[symbol];
        const time = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(event.timestamp) ? event.timestamp.slice(11, 19) : '--:--:--';
        const context = event.sanitizedContext ?? {};
        const backend = context.backend === 'lavalink' || context.backend === 'nodelink' ? context.backend.toUpperCase() : '';
        const duration = typeof event.durationMs === 'number' && Number.isFinite(event.durationMs) && event.durationMs >= 0
            ? this.tools.duration(event.durationMs) : '';
        const counts = event.eventCode === 'DASHBOARD_SNAPSHOT'
            ? [['Nodes', context.nodeCount], ['Players', context.playerCount], ['Playing', context.playingCount], ['Queue', context.queuedTracks], ['Sources', context.sourceCount]]
                .filter((entry) => typeof entry[1] === 'number' && Number.isSafeInteger(entry[1]) && entry[1] >= 0)
                .map(([label, value]) => label + ': ' + value)
            : [];
        const detail = [definition.message, backend, duration, ...counts].filter(Boolean).join(this.unicode ? ' · ' : ' | ');
        const label = this.paint(definition.level.toUpperCase().padEnd(5), severity[definition.level]);
        const category = this.paint(definition.category.padEnd(10), '#818CF8');
        const prefix = [time, label, marker, category].join(' ');
        const result = prefix + ' ' + detail;
        if (this.fits(result))
            return this.clean(result);
        const lines = [];
        let line = '  ';
        for (const word of detail.split(' ')) {
            const next = line.trim() ? line + ' ' + word : '  ' + word;
            if (this.tools.width(next) > this.columns && line.trim()) {
                lines.push(line);
                line = '  ' + word;
            }
            else
                line = next;
        }
        if (line.trim())
            lines.push(line);
        return this.clean([prefix, ...lines].join('\n'));
    }
}
exports.AuroraPresentation = AuroraPresentation;
//# sourceMappingURL=AuroraPresentation.js.map