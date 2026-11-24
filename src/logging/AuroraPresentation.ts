import { version } from '../..';
import type { Manager } from '../core/Manager';
import { auroraCatalog, type AuroraEvent, type AuroraLevel } from './AuroraEvents';

export interface AuroraVisualToolkit {
    figlet(text: string, font: 'ANSI Shadow' | 'Slant' | 'Small'): string;
    gradient(text: string): string;
    paint(text: string, hex: string): string;
    box(text: string, width: number): string;
    width(text: string): number;
    strip(text: string): string;
    duration(ms: number): string;
    symbols: { info: string; success: string; warning: string; error: string };
}
export interface AuroraVisualOptions {
    columns?: number;
    color?: boolean;
    unicode?: boolean;
    /** Set from the actual output stream; no assumption that stdout is the destination. */
    isTTY?: boolean;
}
const severity: Record<AuroraLevel, string> = {
    trace: '#94A3B8', debug: '#818CF8', info: '#36E7F2',
    warn: '#FFC66A', error: '#FF6D91', fatal: '#FF6D91',
};
const semver = /^(?:\d+\.){2}\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export class AuroraPresentation {
    private readonly columns: number;
    private readonly color: boolean;
    private readonly unicode: boolean;
    constructor(private readonly tools: AuroraVisualToolkit, options: AuroraVisualOptions = {}) {
        const columns = options.columns ?? 80;
        if (!Number.isInteger(columns) || columns < 20 || columns > 1000) throw new RangeError('Invalid terminal width');
        this.columns = columns;
        this.color = options.color === true && options.isTTY === true &&
            !('NO_COLOR' in process.env) && !process.env.CI && process.env.TERM !== 'dumb';
        this.unicode = options.unicode !== false;
    }

    private fits(text: string): boolean {
        return text.split('\n').every(line => this.tools.width(this.tools.strip(line)) <= this.columns);
    }
    private paint(text: string, color: string): string {
        return this.color ? this.tools.paint(text, color) : text;
    }
    private clean(text: string): string {
        return this.color ? text : this.tools.strip(text);
    }

    /** Pure render; actual package version and configured automatic failover only. */
    banner(manager: Pick<Manager, 'options'>): string {
        const word = 'NYXLINK';
        let title = word;
        if (this.unicode) {
            for (const font of ['ANSI Shadow', 'Slant', 'Small'] as const) {
                const candidate = this.tools.figlet(word, font).trimEnd();
                if (candidate && this.fits(candidate)) { title = candidate; break; }
            }
        }
        const fields = [
            'Version   ' + (semver.test(version) ? version : 'Unknown'),
            'Backends  Lavalink + NodeLink',
            'Failover  ' + (manager.options.node?.autoMovePlayers === true ? 'Enabled' : 'Disabled'),
        ];
        const raw = fields.join('\n');
        const boxed = this.unicode ? this.tools.box(raw, Math.min(this.columns, 58)) : raw;
        const panel = this.fits(boxed) ? boxed : raw;
        const divider = (this.unicode ? '━' : '-').repeat(Math.min(this.columns, 58));
        const gradient = (text: string) => this.color ? this.tools.gradient(text) : text;
        return this.clean([gradient(title), this.paint('AUDIO WITHOUT BOUNDARIES', '#A78BFA'),
            gradient(divider), panel].join('\n'));
    }

    /** Renders allowlisted events, never arbitrary Pino message or payload fields. */
    event(event: AuroraEvent): string {
        const definition = auroraCatalog[event.eventCode];
        if (!definition) return '';
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
        const detail = [definition.message, backend, duration].filter(Boolean).join(' · ');
        const label = this.paint(definition.level.toUpperCase().padEnd(5), severity[definition.level]);
        const category = this.paint(definition.category.padEnd(10), '#818CF8');
        const prefix = [time, label, marker, category].join(' ');
        const result = prefix + ' ' + detail;
        if (this.fits(result)) return this.clean(result);
        const lines: string[] = [];
        let line = '  ';
        for (const word of detail.split(' ')) {
            const next = line.trim() ? line + ' ' + word : '  ' + word;
            if (this.tools.width(next) > this.columns && line.trim()) {
                lines.push(line);
                line = '  ' + word;
            } else line = next;
        }
        if (line.trim()) lines.push(line);
        return this.clean([prefix, ...lines].join('\n'));
    }
}
