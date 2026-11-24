/** A queued/asynchronous operation no longer belongs to the current player lifecycle. */
export class PlayerOperationCancelledError extends Error {
    public readonly code = 'PLAYER_OPERATION_CANCELLED';
    constructor(public readonly operation: string) {
        super(`Player operation cancelled: ${operation}`);
        this.name = 'PlayerOperationCancelledError';
    }
}
