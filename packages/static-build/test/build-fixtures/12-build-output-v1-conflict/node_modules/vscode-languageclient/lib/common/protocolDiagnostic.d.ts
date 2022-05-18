import * as vscode from 'vscode';
/**
 * We keep this for a while to not break servers which adopted
 * proposed API.
 */
export interface DiagnosticCode {
    value: string | number;
    target: string;
}
export declare namespace DiagnosticCode {
    function is(value: string | number | DiagnosticCode | undefined | null): value is DiagnosticCode;
}
export declare class ProtocolDiagnostic extends vscode.Diagnostic {
    readonly data: unknown | undefined;
    hasDiagnosticCode: boolean;
    constructor(range: vscode.Range, message: string, severity: vscode.DiagnosticSeverity, data: unknown | undefined);
}
