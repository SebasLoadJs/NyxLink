import type { Manager } from '../core/Manager';
import { type AuroraEvent } from './AuroraEvents';
export interface AuroraVisualToolkit {
    figlet(text: string, font: 'ANSI Shadow' | 'Slant' | 'Small'): string;
    gradient(text: string): string;
    paint(text: string, hex: string): string;
    box(text: string, width: number): string;
    width(text: string): number;
    strip(text: string): string;
    duration(ms: number): string;
    symbols: {
        info: string;
        success: string;
        warning: string;
        error: string;
    };
}
export interface AuroraVisualOptions {
    columns?: number;
    color?: boolean;
    unicode?: boolean;
    isTTY?: boolean;
}
export declare class AuroraPresentation {
    private readonly tools;
    private readonly columns;
    private readonly color;
    private readonly unicode;
    constructor(tools: AuroraVisualToolkit, options?: AuroraVisualOptions);
    private fits;
    private paint;
    private clean;
    banner(manager: Pick<Manager, 'options'>): string;
    event(event: AuroraEvent): string;
}
