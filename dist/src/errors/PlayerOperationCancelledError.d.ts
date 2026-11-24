export declare class PlayerOperationCancelledError extends Error {
    readonly operation: string;
    readonly code = "PLAYER_OPERATION_CANCELLED";
    constructor(operation: string);
}
