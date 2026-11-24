import type { ITrack } from '../typings/Interfaces';
export interface MixCreateOptions {
    volume?: number;
    userData?: Record<string, unknown>;
}
export interface MixLayerCreated {
    id: string;
    track: ITrack;
    volume: number;
}
export interface MixLayerState extends MixLayerCreated {
    position: number;
    startTime: number;
}
export interface MixLayersResponse {
    mixes: MixLayerState[];
}
export declare function requireMixId(value: unknown): asserts value is string;
export declare function requireMixVolume(value: unknown): asserts value is number;
export declare function mixCreateBody(value: {
    track: {
        encoded: string;
        userData?: Record<string, unknown>;
    };
    volume?: number;
}): {
    track: {
        encoded: string;
        userData?: Record<string, unknown>;
    };
    volume?: number;
};
export declare function validateMixCreated(value: unknown): asserts value is MixLayerCreated;
export declare function validateMixLayers(value: unknown): asserts value is MixLayersResponse;
