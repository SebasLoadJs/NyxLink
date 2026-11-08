"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpPolicyError = void 0;
class HttpPolicyError extends Error {
    reason;
    code = 'HTTP_POLICY_REJECTED';
    constructor(reason) {
        super(`HTTP request rejected by ${reason} policy`);
        this.reason = reason;
        this.name = 'HttpPolicyError';
    }
}
exports.HttpPolicyError = HttpPolicyError;
//# sourceMappingURL=HttpPolicyError.js.map