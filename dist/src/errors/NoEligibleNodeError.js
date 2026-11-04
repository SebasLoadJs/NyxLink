"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoEligibleNodeError = void 0;
class NoEligibleNodeError extends Error {
    rejections;
    code = 'NO_ELIGIBLE_NODE';
    constructor(rejections) {
        super('NyxLink > PlayerManager#create: No eligible nodes.');
        this.rejections = rejections;
        this.name = 'NoEligibleNodeError';
    }
}
exports.NoEligibleNodeError = NoEligibleNodeError;
//# sourceMappingURL=NoEligibleNodeError.js.map