// Pure diagnostic helpers; no alternate logger or runtime route.
export { diagnoseError } from './ErrorDiagnostics';
export type { ErrorDiagnostic } from './ErrorDiagnostics';
export type { DiagnosticContext } from './SafeDiagnostics';
export { createBanner } from './Banner';
export { formatEntry, formatBox, formatSystemStatus, formatFailover } from './LogFormatter';
export type { AudioNodeStatus, FailoverReport } from './LogFormatter';
