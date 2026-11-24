import { type DiagnosticContext } from './SafeDiagnostics';
export interface ErrorDiagnostic {
    code: string;
    severity: 'error';
    message: string;
    action: string;
    retryable?: boolean;
    context: DiagnosticContext;
    error: unknown;
}
export declare function diagnoseError(error: unknown, context?: DiagnosticContext): ErrorDiagnostic;
