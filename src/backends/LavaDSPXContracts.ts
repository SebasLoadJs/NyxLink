import type { BackendAdapter } from './BackendAdapter';

export interface LavaDSPXPassFilter { cutoffFrequency: number; boostFactor?: number }
export interface LavaDSPXEchoFilter { echoLength: number; decay: number }
export interface LavaDSPXNormalizationFilter { maxAmplitude: number; adaptive?: boolean }
export interface LavaDSPXFilters {
    'high-pass'?: LavaDSPXPassFilter;
    'low-pass'?: LavaDSPXPassFilter;
    echo?: LavaDSPXEchoFilter;
    normalization?: LavaDSPXNormalizationFilter;
}
export const lavaDSPXKeys = ['high-pass', 'low-pass', 'echo', 'normalization'] as const;
export type LavaDSPXKey = typeof lavaDSPXKeys[number];

export function hasLavaDSPXPlugin(plugins: readonly { name: string }[]): boolean {
    return plugins.some(({ name }) => ['lavadspx', 'lavadspx-plugin'].includes(name.toLowerCase()));
}
export function supportsLavaDSPX(backend?: BackendAdapter): boolean {
    return backend?.kind === 'lavalink' && hasLavaDSPXPlugin(backend.plugins) &&
        backend.featureStatus('lavadspx') !== 'unavailable';
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const unit = (v: unknown): v is number => positive(v) && v <= 1;

/** Reject values that upstream would silently disable, including zero normalization/decay. */
export function normalizeLavaDSPX<K extends LavaDSPXKey>(key: K, value: NonNullable<LavaDSPXFilters[K]>): NonNullable<LavaDSPXFilters[K]> {
    const raw: unknown = value;
    if (!object(raw)) throw new TypeError('Invalid LavaDSPX filter');
    let valid = false;
    if (key === 'high-pass' || key === 'low-pass') {
        valid = positive(raw.cutoffFrequency) && Number.isSafeInteger(raw.cutoffFrequency) &&
            raw.cutoffFrequency <= 2147483647 && (raw.boostFactor === undefined || positive(raw.boostFactor));
    } else if (key === 'echo') {
        valid = positive(raw.echoLength) && unit(raw.decay);
    } else if (key === 'normalization') {
        valid = unit(raw.maxAmplitude) && (raw.adaptive === undefined || typeof raw.adaptive === 'boolean');
    }
    if (!valid) throw new TypeError('Invalid LavaDSPX ' + key + ' parameters');
    return structuredClone(value);
}

/** Identify only DSPX-shaped plugin payloads; other generic plugin extensions remain untouched. */
export function suspendLavaDSPX(filters: Record<string, unknown>, backend?: BackendAdapter): string[] {
    if (supportsLavaDSPX(backend)) return [];
    const suspended: string[] = [];
    for (const key of lavaDSPXKeys) {
        const value = filters[key];
        if (!object(value)) continue;
        const signature = key === 'echo' ? 'echoLength' : key === 'normalization' ? 'maxAmplitude' : 'cutoffFrequency';
        if (!Object.hasOwn(value, signature)) continue;
        delete filters[key];
        suspended.push('lavadspx:' + key);
    }
    return suspended;
}
