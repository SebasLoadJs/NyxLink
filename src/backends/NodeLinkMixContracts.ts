import type { ITrack } from '../typings/Interfaces';
import { ProtocolResponseError, validateTrackResponse } from './ProtocolValidation';

export interface MixCreateOptions { volume?: number; userData?: Record<string, unknown> }
export interface MixLayerCreated { id: string; track: ITrack; volume: number }
export interface MixLayerState extends MixLayerCreated { position: number; startTime: number }
export interface MixLayersResponse { mixes: MixLayerState[] }

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    value.trim() === value && !/[\x00-\x1f\x7f]/.test(value) && !value.split('/').some(segment => segment === '.' || segment === '..');

export function requireMixId(value: unknown): asserts value is string {
    if (!id(value)) throw new TypeError('Invalid mix layer ID');
}
export function requireMixVolume(value: unknown): asserts value is number {
    if (!nonnegative(value) || value > 1) throw new TypeError('Mix layer volume must be between 0 and 1');
}
export function mixCreateBody(value: { track: { encoded: string; userData?: Record<string, unknown> }; volume?: number }) {
    if (!object(value) || !object(value.track) || typeof value.track.encoded !== 'string' || !value.track.encoded.trim()) throw new TypeError('Mix creation requires an encoded track');
    if (value.volume !== undefined) requireMixVolume(value.volume);
    if (value.track.userData !== undefined && !object(value.track.userData)) throw new TypeError('Invalid mix userData');
    try { return JSON.parse(JSON.stringify(value)) as typeof value; }
    catch { throw new TypeError('Mix creation must be JSON serializable'); }
}
export function validateMixCreated(value: unknown): asserts value is MixLayerCreated {
    if (!object(value) || !id(value.id) || !nonnegative(value.volume) || value.volume > 1) throw new ProtocolResponseError('mix create', 'layer identity or volume');
    validateTrackResponse(value.track, 'mix create');
}
export function validateMixLayers(value: unknown): asserts value is MixLayersResponse {
    if (!object(value) || !Array.isArray(value.mixes)) throw new ProtocolResponseError('mix list', 'mixes envelope');
    const ids = new Set<string>();
    for (const layer of value.mixes) {
        validateMixCreated(layer);
        if (!object(layer) || !nonnegative(layer.position) || !nonnegative(layer.startTime) || ids.has(layer.id)) throw new ProtocolResponseError('mix list', 'layer state or duplicate identity');
        ids.add(layer.id);
    }
}
