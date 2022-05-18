import { NormalizedDiagnostic } from './logger.js';
import 'vite';
import '@babel/code-frame';
import './types.js';
import 'worker_threads';
import 'eslint';
import './checkers/vls/initParams.js';
import 'vscode-uri';
import 'vscode-languageserver/node';
import 'vscode-languageclient';
import 'vscode-languageclient/node';
import 'typescript';

declare class FileDiagnosticManager {
    diagnostics: NormalizedDiagnostic[];
    private initialized;
    /**
     * Only used when initializing the manager
     */
    initWith(diagnostics: NormalizedDiagnostic[]): void;
    getDiagnostics(fileName?: string): NormalizedDiagnostic[];
    updateByFileId(fileId: string, next: NormalizedDiagnostic[] | null): void;
}

export { FileDiagnosticManager };
