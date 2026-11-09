export type HttpPolicyReason = 'scheme' | 'credentials' | 'origin' | 'redirect-body' | 'redirect-limit' | 'pagination';

/** Reasons describe policy decisions without exposing credential-bearing URLs. */
export class HttpPolicyError extends Error {
    public readonly code = 'HTTP_POLICY_REJECTED';
    constructor(public readonly reason: HttpPolicyReason) {
        super(`HTTP request rejected by ${reason} policy`);
        this.name = 'HttpPolicyError';
    }
}
