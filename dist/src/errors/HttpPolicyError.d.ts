export type HttpPolicyReason = 'scheme' | 'credentials' | 'origin' | 'redirect-body' | 'redirect-limit' | 'pagination';
export declare class HttpPolicyError extends Error {
    readonly reason: HttpPolicyReason;
    readonly code = "HTTP_POLICY_REJECTED";
    constructor(reason: HttpPolicyReason);
}
