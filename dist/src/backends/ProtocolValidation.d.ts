import type { ITrack, IRESTLoadTracks, IRESTGetPlayers } from '../typings/Interfaces';
import type { PlayerUpdateAcknowledgement, SessionUpdateResponse } from './ProtocolContracts';
export declare class ProtocolResponseError extends TypeError {
    readonly operation: string;
    readonly field: string;
    readonly code = "INVALID_PROTOCOL_RESPONSE";
    constructor(operation: string, field: string);
}
export declare function validateTrackResponse(value: unknown, operation?: string): asserts value is ITrack;
export declare function validateLoadResponse(value: unknown): asserts value is IRESTLoadTracks;
export declare function validatePlayerRead(value: unknown, guildId?: string): asserts value is IRESTGetPlayers;
export declare function validatePlayerAcknowledgement(value: unknown, guildId: string): asserts value is PlayerUpdateAcknowledgement;
export declare function validateSessionResponse(value: unknown): asserts value is SessionUpdateResponse;
