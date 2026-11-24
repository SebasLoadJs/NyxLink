"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagnoseError = diagnoseError;
const SafeDiagnostics_1 = require("./SafeDiagnostics");
const actions = {
    FEATURE_UNAVAILABLE: 'Check the current backend capability inventory before using this operation.',
    NO_ELIGIBLE_NODE: 'Inspect node readiness, selection rejections and the requested capabilities.',
    CIRCUIT_OPEN: 'Inspect backend health and wait for the configured circuit recovery probe.',
    HTTP_POLICY_REJECTED: 'Check the requested origin, redirect and TLS policy.',
    TRACK_RESOLUTION_FAILED: 'Check the destination source capabilities and track resolver result.',
    INVALID_SNAPSHOT: 'Validate the snapshot schema before restoring the player.',
    SNAPSHOT_CONFLICT: 'Reload the current snapshot revision before retrying the storage operation.',
    PLAYER_OPERATION_CANCELLED: 'Read the current player and backend session before issuing a new command.',
    INVALID_PROTOCOL_RESPONSE: 'Compare the backend version and response schema with the tested compatibility matrix.',
    ETIMEDOUT: 'Check the operation deadline and backend connectivity before applying a bounded retry policy.',
    ECONNRESET: 'Inspect the connection closure and backend health before retrying an idempotent operation.',
    ENOTFOUND: 'Verify the configured backend hostname and DNS resolution.',
};
function diagnoseError(error, context = {}) {
    const safe = (0, SafeDiagnostics_1.safeDiagnosticValue)(error);
    const fields = safe && typeof safe === 'object' ? safe : {};
    const status = typeof fields.statusCode === 'number' ? fields.statusCode : undefined;
    const code = typeof fields.code === 'string' ? fields.code : status ? `HTTP_${status}` : 'UNKNOWN_ERROR';
    const action = (Object.prototype.hasOwnProperty.call(actions, code) ? actions[code] : undefined) ?? (status === 401 || status === 403 ? 'Verify backend credentials and access permissions.' :
        status === 429 ? 'Respect the server retry delay and reduce request concurrency.' :
            status !== undefined && status >= 500 ? 'Inspect the backend failure and apply the configured retry policy.' :
                'Inspect the recorded error and operation context; the cause has not been classified.');
    return { code, severity: 'error', message: typeof fields.message === 'string' ? fields.message : typeof safe === 'string' ? safe : 'Unclassified failure',
        action, ...(typeof fields.retryable === 'boolean' ? { retryable: fields.retryable } : {}),
        context: (0, SafeDiagnostics_1.safeDiagnosticValue)(context), error: safe };
}
//# sourceMappingURL=ErrorDiagnostics.js.map