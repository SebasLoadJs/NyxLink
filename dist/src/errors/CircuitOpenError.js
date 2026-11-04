"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitOpenError = void 0;
class CircuitOpenError extends Error {
    retryAt;
    code = 'CIRCUIT_OPEN';
    constructor(retryAt) {
        super('Node circuit is open; wait for the recovery probe');
        this.retryAt = retryAt;
        this.name = 'CircuitOpenError';
    }
}
exports.CircuitOpenError = CircuitOpenError;
//# sourceMappingURL=CircuitOpenError.js.map