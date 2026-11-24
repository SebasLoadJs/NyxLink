"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerOperationCancelledError = void 0;
class PlayerOperationCancelledError extends Error {
    operation;
    code = 'PLAYER_OPERATION_CANCELLED';
    constructor(operation) {
        super(`Player operation cancelled: ${operation}`);
        this.operation = operation;
        this.name = 'PlayerOperationCancelledError';
    }
}
exports.PlayerOperationCancelledError = PlayerOperationCancelledError;
//# sourceMappingURL=PlayerOperationCancelledError.js.map