export type DiagnosticContext = Readonly<Record<string, unknown>>;
export declare function safeDiagnosticValue(value: unknown): unknown;
export declare function safeDiagnosticText(value: unknown): string;
